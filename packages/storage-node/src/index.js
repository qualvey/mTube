import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const NODE_ID = process.env.NODE_ID || 'node-01'
const NODE_NAME = process.env.NODE_NAME || 'Storage Node 01 (Primary)'

// Directory setup
const publicDir = path.resolve(__dirname, '../public')
const videosDir = path.resolve(publicDir, 'uploads/videos')
const postersDir = path.resolve(publicDir, 'uploads/posters')

const tempChunksDir = path.resolve(publicDir, 'uploads/temp_chunks')

// Parallel chunk upload engine constants (must match client: packages/admin/src/utils/uploader.js)
const CHUNK_SIZE = 5 * 1024 * 1024

/**
 * Sanitize uploadId against path traversal (../../) attacks.
 * Client-generated ids are hex-only; anything else is rejected.
 */
const sanitizeUploadId = (id) => {
  const s = String(id || '')
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : null
}

if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true })
if (!fs.existsSync(postersDir)) fs.mkdirSync(postersDir, { recursive: true })
if (!fs.existsSync(tempChunksDir)) fs.mkdirSync(tempChunksDir, { recursive: true })

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Cluster-Timestamp', 'X-Cluster-Nonce', 'X-Cluster-Signature']
}))
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ limit: '100mb', extended: true }))

// Request Debug Tracing Middleware
app.use((req, res, next) => {
  const isDebug = process.env.DEBUG === 'true' || process.env.DEBUG === '1' || process.env.LOG_LEVEL === 'debug'
  const startTime = Date.now()
  const len = req.headers['content-length']
  const formattedLen = len ? `${(Number(len) / 1024 / 1024).toFixed(2)} MB` : 'N/A'

  if (isDebug) {
    console.log(`[DEBUG 🐞] ${req.method} ${req.originalUrl || req.url} | Payload: ${formattedLen} | IP: ${req.ip || req.socket?.remoteAddress}`)
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime
    if (res.statusCode >= 400) {
      console.warn(`[WARN ⚠️] ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${duration}ms) [Payload: ${formattedLen}]`)
      if (res.statusCode === 413) {
        console.error(`[HTTP 413 ❌] Storage Node received payload exceeding limit (${formattedLen}). Check Nginx client_max_body_size 2000M; configuration.`)
      }
    } else if (isDebug) {
      console.log(`[DEBUG 🐞] ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${duration}ms)`)
    }
  })
  next()
})

// Allowed source origins for static media & API fallback auth (comma-separated env)
// e.g. ALLOWED_ORIGINS=https://91cso.com,https://admin.91cso.com,http://localhost:5173
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean)

/**
 * Verify cluster auth for storage-node API requests.
 * Order: 1) HMAC ticket signature (issued by main server upload-ticket / proxy upload)
 *        2) TOKEN mode (X-Cluster-Token / clusterSecret / Bearer == CLUSTER_SECRET)
 *        3) Source-origin whitelist (ALLOWED_ORIGINS)
 * HMAC payload = { nodeId: NODE_ID, timestamp } — matches main server createClusterSignedHeaders().
 * Window is 12h because long direct-upload sessions outlive the 5min register/heartbeat window.
 */
const verifyClusterTicketSignature = (req) => {
  const secret = CLUSTER_SECRET
  const timestamp = req.get('X-Cluster-Timestamp')
  const nonce = req.get('X-Cluster-Nonce')
  const signature = req.get('X-Cluster-Signature')

  if (timestamp && nonce && signature) {
    const now = Date.now()
    const reqTime = Number(timestamp)
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 12 * 60 * 60 * 1000) {
      return { valid: false, reason: '签名已过期（超过 12 小时）' }
    }
    const payloadStr = JSON.stringify({ nodeId: NODE_ID, timestamp })
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${payloadStr}.${timestamp}.${nonce}`)
      .digest('hex')
    if (signature !== expectedSig) {
      return { valid: false, reason: 'HMAC 签名不匹配' }
    }
    return { valid: true, mode: 'HMAC-SHA256' }
  }

  // TOKEN mode fallback
  const reqSecret = req.get('X-Cluster-Token') || req.body?.clusterSecret || req.get('Authorization')?.replace('Bearer ', '')
  if (reqSecret && reqSecret === secret) {
    return { valid: true, mode: 'TOKEN' }
  }

  // Source-origin whitelist fallback
  const origin = req.get('origin') || req.get('referer') || ''
  let originHost = ''
  try {
    originHost = origin ? new URL(origin).origin : ''
  } catch (e) { /* ignore */ }
  if (originHost && ALLOWED_ORIGINS.includes(originHost)) {
    return { valid: true, mode: 'ORIGIN' }
  }

  return { valid: false, reason: '缺少有效签名/密钥，且来源域名不在白名单' }
}

// Lock ALL /api/v1/storage/* endpoints (upload / upload-chunk / merge-chunks /
// check-chunks / status / debug) behind cluster auth
app.use('/api/v1/storage', (req, res, next) => {
  const auth = verifyClusterTicketSignature(req)
  if (auth.valid) {
    return next()
  }
  console.warn(`[Storage Node 🔒] Rejected ${req.method} ${req.originalUrl || req.url}: ${auth.reason}`)
  return res.status(401).json({ code: 401, message: `存储节点接口鉴权失败: ${auth.reason}` })
})

// Static media source-origin protection: enforced ONLY when ALLOWED_ORIGINS is configured.
// Hotlink policy (industry standard): requests WITHOUT an Origin/Referer header (mobile WebViews,
// privacy mode, direct URL visits) are allowed; requests WITH an Origin/Referer must match the
// whitelist — otherwise 403. Strict mode (blocking no-referer) would break mobile playback.
app.use('/uploads', (req, res, next) => {
  if (ALLOWED_ORIGINS.length === 0) {
    console.warn('[Storage Node ⚠️] ALLOWED_ORIGINS 未配置，静态媒体当前允许任意来源访问（建议配置 C 端/后台域名）')
    return next()
  }
  const origin = req.get('origin') || req.get('referer') || ''
  let originHost = ''
  try {
    originHost = origin ? new URL(origin).origin : ''
  } catch (e) { /* ignore */ }
  // No source header → allow (mobile WebView / privacy mode / direct link)
  if (!originHost) {
    return next()
  }
  if (ALLOWED_ORIGINS.includes(originHost)) {
    return next()
  }
  return res.status(403).json({ code: 403, message: '来源域名不在白名单，拒绝访问媒体资源' })
})

// Serve static uploaded files (videos & posters with HTTP Range support)
app.use('/uploads', express.static(path.resolve(publicDir, 'uploads')))

// Multer storage config for full single file
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, videosDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4'
    const hash = crypto.createHash('md5').update(file.originalname + Date.now()).digest('hex').substring(0, 10)
    cb(null, `vid_${Date.now()}_${hash}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit per file
})

// Multer storage config for parallel chunks
const chunkStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uploadId = sanitizeUploadId(req.body.uploadId)
    if (!uploadId) {
      return cb(new Error('非法 uploadId（仅允许字母数字与_-，长度≤64）'))
    }
    const targetDir = path.join(tempChunksDir, uploadId)
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
    cb(null, targetDir)
  },
  filename: (req, _file, cb) => {
    const chunkIndex = req.body.chunkIndex !== undefined ? req.body.chunkIndex : '0'
    cb(null, `chunk_${chunkIndex}`)
  }
})
const uploadChunkMulter = multer({ storage: chunkStorage, limits: { fileSize: 100 * 1024 * 1024 } })

/**
 * Extract 50th frame (select=eq(n\,49)) from local video file using FFmpeg
 */
const generateFrame50Poster = (videoPath) => {
  return new Promise((resolve) => {
    const filename = path.basename(videoPath, path.extname(videoPath))
    const posterFilename = `poster_frame50_${filename}.jpg`
    const posterPath = path.join(postersDir, posterFilename)
    const publicPosterPath = `/uploads/posters/${posterFilename}`

    const ffmpegArgs = [
      '-i', videoPath,
      '-vf', 'select=eq(n\\,49)',
      '-vframes', '1',
      '-y',
      posterPath
    ]

    console.log(`[Storage Node 📦] Extracting 50th frame from: ${videoPath}`)
    const ff = spawn('ffmpeg', ffmpegArgs)

    ff.on('close', (code) => {
      if (code === 0 && fs.existsSync(posterPath) && fs.statSync(posterPath).size > 0) {
        console.log(`[Storage Node 📦] Poster generated successfully: ${publicPosterPath}`)
        resolve(publicPosterPath)
      } else {
        console.warn(`[Storage Node 📦] Frame 50 extraction exit code ${code}, fallback to 1s frame...`)
        const fallbackArgs = ['-ss', '00:00:01', '-i', videoPath, '-vframes', '1', '-y', posterPath]
        const ffFb = spawn('ffmpeg', fallbackArgs)
        ffFb.on('close', (fbCode) => {
          if (fbCode === 0 && fs.existsSync(posterPath) && fs.statSync(posterPath).size > 0) {
            resolve(publicPosterPath)
          } else {
            console.error(`[Storage Node 📦] Poster extraction fallback failed for ${videoPath}`)
            resolve('')
          }
        })
      }
    })

    ff.on('error', (err) => {
      console.error(`[Storage Node 📦] FFmpeg process error:`, err.message)
      resolve('')
    })
  })
}

// GET /api/v1/storage/status - Node Health & Usage Info
app.get('/api/v1/storage/status', (_req, res) => {
  let videoCount = 0
  let posterCount = 0

  try { videoCount = fs.readdirSync(videosDir).length } catch (e) {}
  try { posterCount = fs.readdirSync(postersDir).length } catch (e) {}

  res.json({
    code: 200,
    message: 'success',
    data: {
      nodeId: NODE_ID,
      nodeName: NODE_NAME,
      status: 'ONLINE',
      port: PORT,
      videoCount,
      posterCount,
      uptimeSeconds: Math.floor(process.uptime()),
      baseUrl: `http://localhost:${PORT}`
    }
  })
})

// GET /api/v1/storage/debug - Storage Node Debug Diagnostic Endpoint
app.get('/api/v1/storage/debug', (req, res) => {
  let videoCount = 0
  let posterCount = 0
  let tempChunkCount = 0
  try { videoCount = fs.readdirSync(videosDir).length } catch (e) {}
  try { posterCount = fs.readdirSync(postersDir).length } catch (e) {}
  try { tempChunkCount = fs.readdirSync(tempChunksDir).length } catch (e) {}

  res.json({
    code: 200,
    message: 'Storage Node Debug Diagnostic Report',
    data: {
      nodeId: NODE_ID,
      nodeName: NODE_NAME,
      port: PORT,
      publicUrl: process.env.PUBLIC_URL || process.env.NODE_BASE_URL || 'Not set',
      mainServerUrl: process.env.MAIN_SERVER_URL || 'Not set',
      hasClusterSecret: !!process.env.CLUSTER_SECRET,
      isDebugMode: process.env.DEBUG === 'true' || process.env.DEBUG === '1' || process.env.LOG_LEVEL === 'debug',
      stats: {
        videoCount,
        posterCount,
        tempChunkDirs: tempChunkCount,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage()
      },
      clientInfo: {
        ip: req.ip || req.socket?.remoteAddress,
        headers: req.headers
      }
    }
  })
})

// POST /api/v1/storage/upload - Upload video & auto extract frame 50 poster
app.post('/api/v1/storage/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 400, message: 'Missing video file parameter (field: video)' })
  }

  const file = req.file
  const videoPath = file.path
  const publicVideoPath = `/uploads/videos/${file.filename}`

  // Generate 50th frame poster
  const publicPosterPath = await generateFrame50Poster(videoPath)

  const nodePublicUrl = process.env.PUBLIC_URL || process.env.NODE_BASE_URL
  const hostHeader = req.get('host') || `localhost:${PORT}`
  const protocol = req.protocol || 'http'
  const fullBaseUrl = (nodePublicUrl && !nodePublicUrl.includes('localhost'))
    ? nodePublicUrl.replace(/\/$/, '')
    : `${protocol}://${hostHeader}`

  res.json({
    code: 200,
    message: 'Upload to storage node successful',
    data: {
      nodeId: NODE_ID,
      filename: file.filename,
      sizeBytes: file.size,
      videoPath: publicVideoPath,
      posterPath: publicPosterPath,
      videoUrl: `${fullBaseUrl}${publicVideoPath}`,
      posterUrl: publicPosterPath ? `${fullBaseUrl}${publicPosterPath}` : ''
    }
  })
})

// GET /api/v1/storage/check-chunks - Resumable upload check: query existing VALID chunks for uploadId
// Only chunks with the exact expected size count as resumed. 0-byte / partial / stale chunks are
// deleted on the spot so the client re-uploads them (self-healing resume, prevents corrupt merges).
app.get('/api/v1/storage/check-chunks', (req, res) => {
  const uploadId = sanitizeUploadId(req.query.uploadId)
  if (!uploadId) {
    return res.status(400).json({ code: 400, message: 'Missing or invalid uploadId parameter' })
  }

  const fileSize = Number(req.query.fileSize) || 0
  const totalChunks = Number(req.query.totalChunks) || 0
  const chunkDir = path.join(tempChunksDir, uploadId)
  const existingChunks = []

  if (fs.existsSync(chunkDir)) {
    try {
      const files = fs.readdirSync(chunkDir)
      files.forEach(file => {
        if (!file.startsWith('chunk_')) return
        const index = parseInt(file.replace('chunk_', ''), 10)
        if (isNaN(index) || index < 0) return

        const chunkPath = path.join(chunkDir, file)
        try {
          const stat = fs.statSync(chunkPath)
          if (stat.size <= 0) {
            // Corrupt empty chunk — remove so the client re-uploads it
            fs.rmSync(chunkPath, { force: true })
            return
          }
          if (fileSize > 0 && totalChunks > 0 && index < totalChunks) {
            const expected = Math.min(CHUNK_SIZE, fileSize - index * CHUNK_SIZE)
            if (stat.size !== expected) {
              // Partial/oversized chunk from a crashed session — remove and let client re-upload
              fs.rmSync(chunkPath, { force: true })
              return
            }
          }
          existingChunks.push(index)
        } catch (e) { /* ignore race */ }
      })
    } catch (e) { /* ignore */ }
  }

  res.json({
    code: 200,
    message: 'Uploaded chunks query successful',
    data: {
      uploadId,
      uploadedChunks: existingChunks
    }
  })
})

// POST /api/v1/storage/upload-chunk - Receive single parallel file chunk
app.post('/api/v1/storage/upload-chunk', uploadChunkMulter.single('chunk'), (req, res) => {
  const { uploadId, chunkIndex, totalChunks } = req.body
  if (!uploadId || chunkIndex === undefined) {
    return res.status(400).json({ code: 400, message: '缺少 uploadId 或 chunkIndex 参数' })
  }

  const idx = Number(chunkIndex)
  if (!Number.isInteger(idx) || idx < 0) {
    if (req.file && req.file.path) fs.rmSync(req.file.path, { force: true })
    return res.status(400).json({ code: 400, message: 'chunkIndex 必须是非负整数' })
  }

  if (totalChunks !== undefined && totalChunks !== '') {
    const tc = Number(totalChunks)
    if (Number.isInteger(tc) && tc > 0 && idx >= tc) {
      if (req.file && req.file.path) fs.rmSync(req.file.path, { force: true })
      return res.status(400).json({ code: 400, message: `chunkIndex ${idx} 超出总分片数 ${tc}` })
    }
  }

  res.json({
    code: 200,
    message: `分片 ${chunkIndex}/${totalChunks} 保存成功`,
    data: { uploadId, chunkIndex: idx }
  })
})

// POST /api/v1/storage/merge-chunks - Stitch parallel chunks into final video & extract frame 50 poster
app.post('/api/v1/storage/merge-chunks', async (req, res) => {
  const { uploadId, filename, totalChunks, fileSize } = req.body
  if (!uploadId || !totalChunks) {
    return res.status(400).json({ code: 400, message: '缺少 uploadId 或 totalChunks 参数' })
  }

  const safeId = sanitizeUploadId(uploadId)
  if (!safeId) {
    return res.status(400).json({ code: 400, message: '非法 uploadId' })
  }

  const total = Number(totalChunks)
  if (!Number.isInteger(total) || total <= 0) {
    return res.status(400).json({ code: 400, message: 'totalChunks 必须为正整数' })
  }

  // ── Idempotency: if this uploadId was already merged, return the stored result.
  //    Handles client timeout + retry after server-side success → prevents duplicate videos.
  const recordPath = path.join(tempChunksDir, `merge_result_${safeId}.json`)
  if (fs.existsSync(recordPath)) {
    try {
      const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
      if (record && record.filename && fs.existsSync(path.join(videosDir, record.filename))) {
        console.log(`[Storage Node 📦] Merge idempotent hit for ${safeId}, returning stored result`)
        return res.json({ code: 200, message: '分片拼接已完成（幂等命中）', data: record })
      }
    } catch (e) { /* ignore corrupt record */ }
  }

  const chunkDir = path.join(tempChunksDir, safeId)
  if (!fs.existsSync(chunkDir)) {
    return res.status(404).json({ code: 404, message: '未找到分片文件临时目录' })
  }

  const fileSizeNum = Number(fileSize) || 0
  const expectedChunkSize = (i) => (fileSizeNum > 0 ? Math.min(CHUNK_SIZE, fileSizeNum - i * CHUNK_SIZE) : null)

  // ── Pre-validate ALL chunks (existence + exact size) BEFORE touching the final file,
  //    so a missing/corrupt chunk never leaves a half-written video in the library.
  const invalidChunks = []
  for (let i = 0; i < total; i++) {
    const chunkPath = path.join(chunkDir, `chunk_${i}`)
    let size = 0
    try {
      size = fs.statSync(chunkPath).size
    } catch (e) {
      size = -1
    }
    const expected = expectedChunkSize(i)
    if (size <= 0 || (expected !== null && size !== expected)) {
      invalidChunks.push(i)
    }
  }
  if (invalidChunks.length > 0) {
    return res.status(400).json({
      code: 400,
      message: `分片校验失败，缺失或损坏分片: ${invalidChunks.join(', ')}，请重新上传这些分片后再试`
    })
  }

  const ext = path.extname(filename || 'video.mp4') || '.mp4'
  const hash = crypto.createHash('md5').update((filename || 'vid') + Date.now()).digest('hex').substring(0, 10)
  const finalFilename = `vid_${Date.now()}_${hash}${ext}`
  const finalVideoPath = path.join(videosDir, finalFilename)

  try {
    const writeStream = fs.createWriteStream(finalVideoPath)

    for (let i = 0; i < total; i++) {
      writeStream.write(fs.readFileSync(path.join(chunkDir, `chunk_${i}`)))
    }
    writeStream.end()

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    // Final integrity check: merged size must exactly match the original file size
    const finalStat = fs.statSync(finalVideoPath)
    if (fileSizeNum > 0 && finalStat.size !== fileSizeNum) {
      fs.rmSync(finalVideoPath, { force: true })
      return res.status(400).json({ code: 400, message: `缝合后文件大小校验失败 (${finalStat.size} ≠ ${fileSizeNum})，请重新上传` })
    }

    const publicVideoPath = `/uploads/videos/${finalFilename}`
    const publicPosterPath = await generateFrame50Poster(finalVideoPath)

    const nodePublicUrl = process.env.PUBLIC_URL || process.env.NODE_BASE_URL
    const hostHeader = req.get('host') || `localhost:${PORT}`
    const protocol = req.protocol || 'http'
    const fullBaseUrl = (nodePublicUrl && !nodePublicUrl.includes('localhost'))
      ? nodePublicUrl.replace(/\/$/, '')
      : `${protocol}://${hostHeader}`

    const record = {
      nodeId: NODE_ID,
      filename: finalFilename,
      sizeBytes: finalStat.size,
      videoPath: publicVideoPath,
      posterPath: publicPosterPath,
      videoUrl: `${fullBaseUrl}${publicVideoPath}`,
      posterUrl: publicPosterPath ? `${fullBaseUrl}${publicPosterPath}` : ''
    }

    // Persist idempotency record BEFORE deleting chunks (crash-safe), then cleanup temp chunks
    try {
      fs.writeFileSync(recordPath, JSON.stringify(record))
    } catch (e) {
      console.error(`[Storage Node 📦] Failed to persist merge record for ${safeId}:`, e.message)
    }
    try {
      fs.rmSync(chunkDir, { recursive: true, force: true })
    } catch (e) {}

    console.log(`[Storage Node 📦] Parallel chunks merged successfully: ${finalFilename} (${(finalStat.size / 1024 / 1024).toFixed(2)} MB)`)

    res.json({
      code: 200,
      message: '多分片并发传输与缝合完成！',
      data: record
    })
  } catch (err) {
    console.error(`[Storage Node 📦] Chunk merge error for ${safeId}:`, err.message)
    res.status(500).json({ code: 500, message: `分片合并处理失败: ${err.message}` })
  }
})

const MAIN_SERVER_URL = process.env.MAIN_SERVER_URL || 'http://localhost:3000'
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.NODE_BASE_URL || `http://localhost:${PORT}`
const CLUSTER_SECRET = process.env.CLUSTER_SECRET || 'streamvip-cluster-secret'
const HEARTBEAT_INTERVAL = Number(process.env.HEARTBEAT_INTERVAL) || 30

/**
 * Generate HMAC-SHA256 signature headers with Timestamp + Nonce to prevent Replay attacks & Secret exposure
 */
const createHmacSignedHeaders = (payload, secret) => {
  const timestamp = Date.now().toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const bodyString = typeof payload === 'string' ? payload : JSON.stringify(payload)

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${bodyString}.${timestamp}.${nonce}`)
    .digest('hex')

  return {
    'Content-Type': 'application/json',
    'X-Cluster-Timestamp': timestamp,
    'X-Cluster-Nonce': nonce,
    'X-Cluster-Signature': signature
  }
}

/**
 * Safely format target API URL (supports https://domain.com, https://domain.com/api, http://IP:3000)
 */
const buildApiUrl = (baseUrl, endpointPath) => {
  let cleanBase = baseUrl.replace(/\/$/, '')
  cleanBase = cleanBase.replace(/\/api\/v1$/, '').replace(/\/api$/, '')
  return `${cleanBase}/api/v1/${endpointPath.replace(/^\//, '')}`
}

/**
 * Auto-Register with Main Control Server on startup
 */
const registerWithMainServer = async () => {
  if (!MAIN_SERVER_URL) return

  try {
    const targetUrl = buildApiUrl(MAIN_SERVER_URL, 'storage-nodes/register')
    console.log(`[Storage Node 📦] Auto-registering (HMAC-SHA256 Signed) to Main Control Server: ${targetUrl}`)

    const payload = {
      id: NODE_ID,
      name: NODE_NAME,
      baseUrl: PUBLIC_URL,
      isDefault: process.env.IS_DEFAULT === 'true'
    }

    const headers = createHmacSignedHeaders(payload, CLUSTER_SECRET)

    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })

    const text = await resp.text()
    let json = null
    try { json = JSON.parse(text) } catch (e) {}

    if (resp.ok && json && json.code === 200) {
      console.log(`[Storage Node 📦] ✅ Auto-registered successfully with Main Control Server! Response: ${json.message}`)
    } else if (resp.status === 404) {
      console.warn(`[Storage Node 📦] Auto-registration returned HTTP 404: 主站服务器 (https://91cso.com) 尚未更新部署最新的 /api/v1/storage-nodes/register 自动注册路由，请触发主站 CI/CD 升级主站容器镜像。`)
    } else {
      console.warn(`[Storage Node 📦] Auto-registration returned status ${resp.status}:`, json ? (json.message || json) : text.substring(0, 150))
    }
  } catch (err) {
    console.warn(`[Storage Node 📦] Auto-registration connection failed to ${MAIN_SERVER_URL}:`, err.message)
  }
}

/**
 * Send periodic heartbeat to Main Control Server
 */
const sendHeartbeat = async () => {
  if (!MAIN_SERVER_URL) return

  let videoCount = 0
  try { videoCount = fs.readdirSync(videosDir).length } catch (e) {}

  try {
    const targetUrl = buildApiUrl(MAIN_SERVER_URL, 'storage-nodes/heartbeat')
    const payload = {
      id: NODE_ID,
      status: 'ONLINE',
      videoCount
    }
    const headers = createHmacSignedHeaders(payload, CLUSTER_SECRET)

    await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
  } catch (err) {
    // Silent fail on heartbeat retry
  }
}

app.listen(PORT, async () => {
  console.log(`[Storage Node 📦] ${NODE_NAME} (${NODE_ID}) running on port ${PORT}`)
  await registerWithMainServer()
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL * 1000)
})

// Final error handler → clean JSON 400/500 instead of HTML error pages.
// Must be registered AFTER all routes to catch multer/route errors (invalid
// uploadId path-traversal attempts, oversized files, missing fields, etc.)
app.use((err, _req, res, _next) => {
  const msg = (err && err.message) || '上传处理失败'
  if (err instanceof multer.MulterError) {
    const reason = err.code === 'LIMIT_FILE_SIZE' ? `文件大小超过限制 (${err.field || 'unknown'})` : err.message
    return res.status(400).json({ code: 400, message: `上传参数/文件校验失败: ${reason}` })
  }
  // Non-multer storage errors (e.g. rejected uploadId from destination callback)
  return res.status(400).json({ code: 400, message: `上传被拒绝: ${msg}` })
})
