import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { PassThrough } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import multer from 'multer'
import { CHUNK_SIZE } from './config.js'

/**
 * Sanitize uploadId against path traversal (../../) attacks.
 * Client-generated ids are hex-only; anything else is rejected.
 * @param {unknown} id
 * @returns {string|null}
 */
export const sanitizeUploadId = (id) => {
  const s = String(id || '')
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : null
}

/** Multer disk storage for a full single-file upload (non-chunked path). */
export const createSingleUpload = ({ videosDir }) =>
  multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, videosDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.mp4'
        const hash = crypto.createHash('md5').update(file.originalname + Date.now()).digest('hex').substring(0, 10)
        cb(null, `vid_${Date.now()}_${hash}${ext}`)
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB per file
  })

/** Multer disk storage for a single parallel chunk. */
export const createChunkUpload = ({ tempChunksDir }) =>
  multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const uploadId = sanitizeUploadId(req.body.uploadId)
        if (!uploadId) {
          return cb(new Error('非法 uploadId（仅允许字母数字与_-，长度≤64）'))
        }
        const targetDir = path.join(tempChunksDir, uploadId)
        fs.mkdirSync(targetDir, { recursive: true })
        cb(null, targetDir)
      },
      filename: (req, _file, cb) => {
        const chunkIndex = req.body.chunkIndex !== undefined ? req.body.chunkIndex : '0'
        cb(null, `chunk_${chunkIndex}`)
      },
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
  })

/**
 * Stream-merge chunk files into a single video without buffering the whole file,
 * then verify end-of-stream size matches expectations and delete temp chunks.
 *
 * Uses node:stream/promises pipeline so backpressure is honored (no memory blowup on
 * multi-GB merges) — the previous sync readFileSync loop buffered every chunk.
 *
 * @param {string[]} chunkPaths ordered absolute paths, one per chunk index
 * @param {string} finalVideoPath output path
 * @param {number} expectedFinalSize bytes (0 = skip size check)
 * @returns {Promise<number>} final size in bytes
 */
export const mergeChunksToFile = async ({ chunkPaths, finalVideoPath, expectedFinalSize }) => {
  // Compose a readable stream that yields each chunk file in order, then completes.
  const source = new PassThrough()
  const writeStream = fs.createWriteStream(finalVideoPath)

  // Feed chunks into the PassThrough independently; errors from either side propagate.
  const feeder = (async () => {
    try {
      for (const chunkPath of chunkPaths) {
        const rs = fs.createReadStream(chunkPath)
        await pipeline(rs, source, { end: false })
      }
      source.end()
    } catch (err) {
      source.destroy(err)
    }
  })()

  try {
    await pipeline(source, writeStream)
    await feeder
  } catch (err) {
    await writeStream.destroy()
    // Best-effort cleanup of the half-written output so we never leave a corrupt file.
    try {
      fs.rmSync(finalVideoPath, { force: true })
    } catch {
      /* ignore */
    }
    throw err
  }

  const finalStat = fs.statSync(finalVideoPath)
  if (expectedFinalSize > 0 && finalStat.size !== expectedFinalSize) {
    fs.rmSync(finalVideoPath, { force: true })
    const err = new Error(`缝合后文件大小校验失败 (${finalStat.size} ≠ ${expectedFinalSize})`)
    err.sizeMismatch = true
    throw err
  }
  return finalStat.size
}

/**
 * Validate that all chunks for a merge exist with exactly the expected size.
 * Returns the list of bad chunk indexes (empty = all good).
 * @param {string} chunkDir
 * @param {number} total
 * @param {number} fileSize (0 = skip per-chunk size check)
 */
export const findInvalidChunks = ({ chunkDir, total, fileSize }) => {
  const expectedChunkSize = (i) => (fileSize > 0 ? Math.min(CHUNK_SIZE, fileSize - i * CHUNK_SIZE) : null)
  const invalid = []
  for (let i = 0; i < total; i++) {
    const chunkPath = path.join(chunkDir, `chunk_${i}`)
    let size = 0
    try {
      size = fs.statSync(chunkPath).size
    } catch {
      size = -1
    }
    const expected = expectedChunkSize(i)
    if (size <= 0 || (expected !== null && size !== expected)) {
      invalid.push(i)
    }
  }
  return invalid
}

/**
 * Persist a merge-idempotency record. Stored outside the temp-chunk dir so container
 * restarts / temp cleanup don't lose it. Returns the path used.
 * @param {{recordPath:string, record:object}} args
 */
export const persistMergeRecord = ({ recordPath, record }) => {
  fs.mkdirSync(path.dirname(recordPath), { recursive: true })
  fs.writeFileSync(recordPath, JSON.stringify(record))
}
