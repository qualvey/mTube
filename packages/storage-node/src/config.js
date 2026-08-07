import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEFAULT_CLUSTER_SECRET = 'streamvip-cluster-secret'

/**
 * Load storage-node configuration from env.
 *
 * Security: CLUSTER_SECRET is the only thing protecting every /api/v1/storage/* endpoint.
 * If it's not explicitly configured we FAIL CLOSED (throw) instead of silently falling back
 * to the known built-in default — otherwise a deploy that forgets to set it exposes the node
 * to anyone who knows the hardcoded secret (uploads / merges / data abuse).
 *
 * Set ALLOW_INSECURE_DEFAULT_SECRET=1 to bypass ONLY for local dev when you understand the risk.
 */
const resolveClusterSecret = () => {
  const raw = process.env.CLUSTER_SECRET
  if (raw && raw.trim() !== '') {
    const secret = raw.trim()
    if (secret === DEFAULT_CLUSTER_SECRET) {
      throw new Error(
        'CLUSTER_SECRET equals the insecure built-in default. Set a strong, unique secret for production.'
      )
    }
    return secret
  }
  // Local dev escape hatch: default works only when explicitly permitted AND secret not overridden.
  if (process.env.ALLOW_INSECURE_DEFAULT_SECRET === '1' || process.env.ALLOW_INSECURE_DEFAULT_SECRET === 'true') {
    console.warn(
      '[Storage Node ⚠️] ALLOW_INSECURE_DEFAULT_SECRET is set — using the built-in default CLUSTER_SECRET. ' +
      'Do NOT use this in production.'
    )
    return DEFAULT_CLUSTER_SECRET
  }
  throw new Error(
    'CLUSTER_SECRET is not configured. Refusing to start insecurely. ' +
    'Set a strong CLUSTER_SECRET (must differ from the built-in default), or set ' +
    'ALLOW_INSECURE_DEFAULT_SECRET=1 for local development only.'
  )
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  nodeId: process.env.NODE_ID || 'node-01',
  nodeName: process.env.NODE_NAME || 'Storage Node 01 (Primary)',
  clusterSecret: resolveClusterSecret(),

  mainServerUrl: process.env.MAIN_SERVER_URL || 'http://localhost:3000',
  publicUrl: process.env.PUBLIC_URL || process.env.NODE_BASE_URL || '',
  isDefaultNode: process.env.IS_DEFAULT === 'true',
  heartbeatIntervalSec: Number(process.env.HEARTBEAT_INTERVAL) || 30,

  // Comma-separated source-origin whitelist for static media hotlink protection
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),

  isDebug: process.env.DEBUG === 'true' || process.env.DEBUG === '1' || process.env.LOG_LEVEL === 'debug',
}

// ── Directory layout (runtime dirs are git-ignored; created lazily here) ──
export const dirs = {
  publicDir: path.resolve(__dirname, '../public'),
  videosDir: path.resolve(__dirname, '../public/uploads/videos'),
  postersDir: path.resolve(__dirname, '../public/uploads/posters'),
  tempChunksDir: path.resolve(__dirname, '../public/uploads/temp_chunks'),
  // Idempotency records live OUTSIDE the temp-chunk dir so container restarts /
  // temp cleanup don't lose merge results (persistent media volume).
  mergeRecordsDir: path.resolve(__dirname, '../public/uploads/merge_records'),
}

// Parallel chunk upload engine constants (must match client: packages/admin/src/utils/uploader.js)
export const CHUNK_SIZE = 5 * 1024 * 1024

export const HMAC_WINDOW_MS = 12 * 60 * 60 * 1000 // 12h: long direct-upload sessions outlive 5min register/heartbeat
