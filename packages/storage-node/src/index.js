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

if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true })
if (!fs.existsSync(postersDir)) fs.mkdirSync(postersDir, { recursive: true })

app.use(cors())
app.use(express.json())

// Serve static uploaded files (videos & posters with HTTP Range support)
app.use('/uploads', express.static(path.resolve(publicDir, 'uploads')))

// Multer storage config
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

  const hostHeader = req.get('host') || `localhost:${PORT}`
  const protocol = req.protocol || 'http'
  const fullBaseUrl = `${protocol}://${hostHeader}`

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

app.listen(PORT, () => {
  console.log(`[Storage Node 📦] ${NODE_NAME} (${NODE_ID}) running on port ${PORT}`)
})
