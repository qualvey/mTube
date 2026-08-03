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

if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true })
if (!fs.existsSync(postersDir)) fs.mkdirSync(postersDir, { recursive: true })
if (!fs.existsSync(tempChunksDir)) fs.mkdirSync(tempChunksDir, { recursive: true })

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Cluster-Timestamp', 'X-Cluster-Nonce', 'X-Cluster-Signature']
}))
app.use(express.json())

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
    const uploadId = req.body.uploadId || 'temp_upload'
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

// POST /api/v1/storage/upload-chunk - Receive single parallel file chunk
app.post('/api/v1/storage/upload-chunk', uploadChunkMulter.single('chunk'), (req, res) => {
  const { uploadId, chunkIndex, totalChunks } = req.body
  if (!uploadId || chunkIndex === undefined) {
    return res.status(400).json({ code: 400, message: '缺少 uploadId 或 chunkIndex 参数' })
  }
  res.json({
    code: 200,
    message: `分片 ${chunkIndex}/${totalChunks} 保存成功`,
    data: { uploadId, chunkIndex: Number(chunkIndex) }
  })
})

// POST /api/v1/storage/merge-chunks - Stitch parallel chunks into final video & extract frame 50 poster
app.post('/api/v1/storage/merge-chunks', async (req, res) => {
  const { uploadId, filename, totalChunks } = req.body
  if (!uploadId || !totalChunks) {
    return res.status(400).json({ code: 400, message: '缺少 uploadId 或 totalChunks 参数' })
  }

  const chunkDir = path.join(tempChunksDir, uploadId)
  if (!fs.existsSync(chunkDir)) {
    return res.status(404).json({ code: 404, message: '未找到分片文件临时目录' })
  }

  const ext = path.extname(filename || 'video.mp4') || '.mp4'
  const hash = crypto.createHash('md5').update((filename || 'vid') + Date.now()).digest('hex').substring(0, 10)
  const finalFilename = `vid_${Date.now()}_${hash}${ext}`
  const finalVideoPath = path.join(videosDir, finalFilename)

  try {
    const writeStream = fs.createWriteStream(finalVideoPath)

    for (let i = 0; i < Number(totalChunks); i++) {
      const chunkPath = path.join(chunkDir, `chunk_${i}`)
      if (!fs.existsSync(chunkPath)) {
        writeStream.close()
        return res.status(400).json({ code: 400, message: `缺失分片文件: chunk_${i}` })
      }
      const chunkBuffer = fs.readFileSync(chunkPath)
      writeStream.write(chunkBuffer)
    }
    writeStream.end()

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    // Clean up temporary chunks directory
    try {
      fs.rmSync(chunkDir, { recursive: true, force: true })
    } catch (e) {}

    const publicVideoPath = `/uploads/videos/${finalFilename}`
    const publicPosterPath = await generateFrame50Poster(finalVideoPath)

    const nodePublicUrl = process.env.PUBLIC_URL || process.env.NODE_BASE_URL
    const hostHeader = req.get('host') || `localhost:${PORT}`
    const protocol = req.protocol || 'http'
    const fullBaseUrl = (nodePublicUrl && !nodePublicUrl.includes('localhost'))
      ? nodePublicUrl.replace(/\/$/, '')
      : `${protocol}://${hostHeader}`

    const stats = fs.statSync(finalVideoPath)

    console.log(`[Storage Node 📦] Parallel chunks merged successfully: ${finalFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)

    res.json({
      code: 200,
      message: '多分片并发传输与缝合完成！',
      data: {
        nodeId: NODE_ID,
        filename: finalFilename,
        sizeBytes: stats.size,
        videoPath: publicVideoPath,
        posterPath: publicPosterPath,
        videoUrl: `${fullBaseUrl}${publicVideoPath}`,
        posterUrl: publicPosterPath ? `${fullBaseUrl}${publicPosterPath}` : ''
      }
    })
  } catch (err) {
    console.error(`[Storage Node 📦] Chunk merge error for ${uploadId}:`, err.message)
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
