import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { dirs } from '../src/config.js'
import {
  sanitizeUploadId,
  mergeChunksToFile,
  findInvalidChunks,
  persistMergeRecord,
  createSingleUpload,
  createChunkUpload,
} from '../src/upload.js'
import { createHmacSignedHeaders, verifyClusterTicketSignature, originHostOf } from '../src/auth.js'
import { buildApiUrl, resolvePublicBaseUrl, mediaUrl } from '../src/cluster.js'
import { probeFfmpeg } from '../src/ffmpeg.js'

const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'storage-node-test-'))
const SECRET = 'strong-test-secret-123456'
const ctx = { secret: SECRET, nodeId: 'node-01', allowedOrigins: ['https://91cso.com'], windowMs: 12 * 3600 * 1000 }

// A minimal fake Request object exposing the header surface the auth fn reads.
const fakeReq = (headers, body) => ({ get: (n) => headers[n], body: body || {} })

describe('sanitizeUploadId (path traversal protection)', () => {
  test('accepts valid hex/alnum ids', () => {
    assert.equal(sanitizeUploadId('abc123DEF_-'), 'abc123DEF_-')
    assert.equal(sanitizeUploadId('a'.repeat(64)), 'a'.repeat(64))
  })
  test('rejects traversal and malformed ids', () => {
    assert.equal(sanitizeUploadId('../../etc/passwd'), null)
    assert.equal(sanitizeUploadId('../x'), null)
    assert.equal(sanitizeUploadId('a/b'), null)
    assert.equal(sanitizeUploadId('a b'), null)
    assert.equal(sanitizeUploadId(''), null)
    assert.equal(sanitizeUploadId(undefined), null)
    assert.equal(sanitizeUploadId('a'.repeat(65)), null)
  })
})

describe('cluster HMAC auth', () => {
  test('verify accepts a correctly signed request', () => {
    const headers = createHmacSignedHeaders({ nodeId: 'node-01', timestamp: Date.now().toString() }, SECRET)
    const verdict = verifyClusterTicketSignature(fakeReq(headers), ctx)
    assert.deepEqual(verdict, { valid: true, mode: 'HMAC-SHA256' })
  })
  test('verify rejects a tampered signature', () => {
    const headers = createHmacSignedHeaders({ nodeId: 'node-01' }, SECRET)
    headers['X-Cluster-Signature'] = 'deadbeef'
    const verdict = verifyClusterTicketSignature(fakeReq(headers), ctx)
    assert.equal(verdict.valid, false)
  })
  test('verify rejects an expired timestamp', () => {
    const headers = createHmacSignedHeaders({ nodeId: 'node-01' }, SECRET)
    headers['X-Cluster-Timestamp'] = (Date.now() - 13 * 3600 * 1000).toString()
    const verdict = verifyClusterTicketSignature(fakeReq(headers), ctx)
    assert.equal(verdict.valid, false)
  })
  test('TOKEN mode fallback works', () => {
    const verdict = verifyClusterTicketSignature(fakeReq({ 'X-Cluster-Token': SECRET }), ctx)
    assert.deepEqual(verdict, { valid: true, mode: 'TOKEN' })
  })
  test('ORIGIN whitelist fallback works', () => {
    const verdict = verifyClusterTicketSignature(fakeReq({ origin: 'https://91cso.com' }), ctx)
    assert.deepEqual(verdict, { valid: true, mode: 'ORIGIN' })
  })
  test('rejects unknown origin without creds', () => {
    const verdict = verifyClusterTicketSignature(fakeReq({ origin: 'https://evil.com' }), ctx)
    assert.equal(verdict.valid, false)
  })
})

describe('originHostOf', () => {
  test('parses origin and normalizes', () => {
    assert.equal(originHostOf(fakeReq({ origin: 'https://91cso.com' })), 'https://91cso.com')
    assert.equal(originHostOf(fakeReq({ referer: 'https://admin.91cso.com/x' })), 'https://admin.91cso.com')
  })
  test('returns empty when absent/bad', () => {
    assert.equal(originHostOf(fakeReq({})), '')
    assert.equal(originHostOf(fakeReq({ origin: 'not a url' })), '')
  })
})

describe('buildApiUrl / resolvePublicBaseUrl / mediaUrl', () => {
  test('buildApiUrl strips trailing slash and /api/v1 suffix', () => {
    assert.equal(buildApiUrl('https://91cso.com', 'storage-nodes/register'), 'https://91cso.com/api/v1/storage-nodes/register')
    assert.equal(buildApiUrl('https://91cso.com/api/v1', 'x'), 'https://91cso.com/api/v1/x')
    assert.equal(buildApiUrl('http://1.2.3.4:3000', '/y'), 'http://1.2.3.4:3000/api/v1/y')
  })
  test('resolvePublicBaseUrl prefers PUBLIC_URL when not localhost', () => {
    const cfg = { publicUrl: 'https://storage.91cso.com', port: 3001 }
    const req = { get: () => 'localhost:3001', protocol: 'http' }
    assert.equal(resolvePublicBaseUrl(cfg, req), 'https://storage.91cso.com')
  })
  test('resolvePublicBaseUrl falls back to host header', () => {
    const cfg = { publicUrl: 'http://localhost:3001', port: 3001 }
    const req = { get: () => 'storage.91cso.com', protocol: 'https' }
    assert.equal(resolvePublicBaseUrl(cfg, req), 'https://storage.91cso.com')
  })
  test('mediaUrl joins base + path, empty path -> empty', () => {
    assert.equal(mediaUrl('https://x.com', '/uploads/videos/a.mp4'), 'https://x.com/uploads/videos/a.mp4')
    assert.equal(mediaUrl('https://x.com', ''), '')
  })
})

describe('mergeChunksToFile (stream merge)', () => {
  test('merges chunks in order and validates final size', async () => {
    const tmp = mkTmp()
    const a = path.join(tmp, 'a'); fs.writeFileSync(a, 'hello ')
    const b = path.join(tmp, 'b'); fs.writeFileSync(b, 'world')
    const out = path.join(tmp, 'out.txt')

    const size = await mergeChunksToFile({
      chunkPaths: [a, b],
      finalVideoPath: out,
      expectedFinalSize: 11,
    })
    assert.equal(size, 11)
    assert.equal(fs.readFileSync(out, 'utf8'), 'hello world')
  })

  test('throws and removes half-written file on size mismatch (no corrupt video left behind)', async () => {
    const tmp = mkTmp()
    const a = path.join(tmp, 'a'); fs.writeFileSync(a, 'aaaa')
    const out = path.join(tmp, 'out.txt')

    await assert.rejects(
      mergeChunksToFile({ chunkPaths: [a], finalVideoPath: out, expectedFinalSize: 999 }),
      /大小校验失败/
    )
    assert.equal(fs.existsSync(out), false, 'partial file must be cleaned up')
  })

  test('throws on a missing chunk (read error path)', async () => {
    const tmp = mkTmp()
    const missing = path.join(tmp, 'nope')
    const out = path.join(tmp, 'out.txt')
    await assert.rejects(mergeChunksToFile({ chunkPaths: [missing], finalVideoPath: out, expectedFinalSize: 0 }))
    assert.equal(fs.existsSync(out), false)
  })
})

describe('findInvalidChunks', () => {
  test('flags missing and wrong-sized chunks', () => {
    const tmp = mkTmp()
    const dir = path.join(tmp, 'chunks'); fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'chunk_0'), 'x'.repeat(2048)) // correct size for fileSize=2048
    // chunk_1 missing
    fs.writeFileSync(path.join(dir, 'chunk_2'), 'x'.repeat(999)) // wrong size
    const bad = findInvalidChunks({ chunkDir: dir, total: 3, fileSize: 2048 })
    assert.deepEqual(bad.sort(), [1, 2])
  })
  test('no fileSize → only empty/missing flagged', () => {
    const tmp = mkTmp()
    const dir = path.join(tmp, 'chunks'); fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'chunk_0'), 'ok')
    const bad = findInvalidChunks({ chunkDir: dir, total: 1, fileSize: 0 })
    assert.deepEqual(bad, [])
  })
})

describe('persistMergeRecord', () => {
  test('writes JSON record and creates dirs', () => {
    const tmp = mkTmp()
    const recordPath = path.join(tmp, 'records', 'merge_result_x.json')
    persistMergeRecord({ recordPath, record: { filename: 'v.mp4', sizeBytes: 100 } })
    const parsed = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
    assert.deepEqual(parsed, { filename: 'v.mp4', sizeBytes: 100 })
  })
})

describe('multer uploads config', () => {
  test('single upload & chunk upload construct without throwing', () => {
    assert.ok(createSingleUpload({ videosDir: dirs.videosDir }))
    assert.ok(createChunkUpload({ tempChunksDir: dirs.tempChunksDir }))
  })
})

describe('ffmpeg probe', () => {
  test('resolve a boolean without throwing', async () => {
    const ok = await probeFfmpeg()
    assert.equal(typeof ok, 'boolean')
  })
})
