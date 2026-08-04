import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import http from 'http'
import https from 'https'
import zlib from 'zlib'
import { spawn } from 'child_process'
import multer from 'multer'
import ytdl from '@distube/ytdl-core'
import { db } from './db.js'
import { logger, requestLoggerMiddleware } from './logger.js'

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.set('trust proxy', true)
const PORT = 3000


const uploadsDir = path.resolve(__dirname, '../public/uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const postersDir = path.resolve(__dirname, '../public/uploads/posters')
if (!fs.existsSync(postersDir)) {
  fs.mkdirSync(postersDir, { recursive: true })
}

// Serve local static media files (uploaded local videos/images)
app.use('/uploads', express.static(uploadsDir))

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

app.use(cors())
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))
app.use(express.text({ limit: '100mb' }))

// Apply Detailed Request/Response Tracer Middleware
app.use(requestLoggerMiddleware)

// Global safety error handlers
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err.message)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason)
})

// Helper for standard API response
const sendResponse = (res, data, code = 200, message = 'success') => {
  if (res.headersSent) return
  res.status(code).json({
    code,
    message,
    data
  })
}

/**
 * Strict Header Normalizer
 * Strictly parses and uses the exact headers provided by the admin panel,
 * preserving all user-specified custom headers while sanitizing invalid UA strings.
 */
const normalizeHeaders = (input) => {
  let headers = {}
  if (input) {
    try {
      const obj = typeof input === 'string' ? JSON.parse(input) : input

      if (obj && typeof obj === 'object') {
        if (obj.headers && typeof obj.headers === 'object') {
          headers = { ...obj.headers }
        } else {
          headers = { ...obj }
        }
      }

      if (obj.referrer && !headers['Referer'] && !headers['referer']) {
        headers['Referer'] = obj.referrer
      }

      // Remove internal fetch option properties that are not HTTP headers
      delete headers.method
      delete headers.body
      delete headers.mode
      delete headers.credentials
    } catch (e) {
      headers = {}
    }
  }

  // Sanitize non-existent or invalid User-Agent strings (e.g. Chrome/150)
  const userAgentKey = Object.keys(headers).find(k => k.toLowerCase() === 'user-agent')
  if (userAgentKey) {
    const val = headers[userAgentKey]
    if (val && val.includes('Chrome/150')) {
      headers[userAgentKey] = DEFAULT_USER_AGENT
    }
  } else {
    headers['User-Agent'] = DEFAULT_USER_AGENT
  }

  return headers
}

// Helper to proxy direct media/fragment stream with Range & Custom Request Headers
const proxyDirectUrl = (videoUrl, req, res, customHeaders = {}, retryCount = 0) => {
  if (!videoUrl || res.headersSent) return
  const cleanUrl = videoUrl.trim()

  try {
    const urlObj = new URL(cleanUrl)
    const finalHeaders = {
      'Host': urlObj.host,
      ...customHeaders
    }

    const protocol = cleanUrl.startsWith('https') ? https : http
    const options = {
      headers: { ...finalHeaders }
    }

    if (req.headers.range) {
      options.headers['range'] = req.headers.range
    }

    const proxyReq = protocol.get(cleanUrl, options, (streamRes) => {
      if (res.headersSent) return

      // Handle 3xx Redirects (e.g. HTTP -> HTTPS 301 Redirect)
      if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
        const redirectUrl = streamRes.headers.location.startsWith('http')
          ? streamRes.headers.location
          : new URL(streamRes.headers.location, cleanUrl).href
        logger.info(`[Proxy Direct Stream] Following ${streamRes.statusCode} redirect to: ${redirectUrl}`)
        return proxyDirectUrl(redirectUrl, req, res, finalHeaders, retryCount)
      }

      // Handle 4xx / 5xx Upstream Failures -> Fallback to sample video
      if (streamRes.statusCode >= 400 && cleanUrl !== 'https://vjs.zencdn.net/v/oceans.mp4') {
        logger.warn(`Proxy upstream returned HTTP ${streamRes.statusCode} for ${cleanUrl}, falling back to sample stream.`)
        return proxyDirectUrl('https://vjs.zencdn.net/v/oceans.mp4', req, res)
      }

      const responseHeaders = {
        'Content-Type': streamRes.headers['content-type'] || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      }

      if (streamRes.headers['content-length']) {
        responseHeaders['Content-Length'] = streamRes.headers['content-length']
      }

      if (streamRes.headers['content-range']) {
        responseHeaders['Content-Range'] = streamRes.headers['content-range']
      }

      res.writeHead(streamRes.statusCode || 200, responseHeaders)

      streamRes.on('error', (err) => {
        logger.error('Stream response error:', err.message)
      })

      streamRes.pipe(res)
    })

    proxyReq.on('error', (err) => {
      // Automatic retry on transient Keep-Alive socket drops
      if (err.message.includes('socket hang up') && retryCount < 2 && !res.headersSent) {
        logger.info(`[Proxy Direct Stream] Transient socket hang up, retrying fresh connection (${retryCount + 1}/2)...`)
        return proxyDirectUrl(cleanUrl, req, res, customHeaders, retryCount + 1)
      }
      logger.error('Video proxy stream request error:', err.message)
      if (!res.headersSent) {
        proxyDirectUrl('https://vjs.zencdn.net/v/oceans.mp4', req, res)
      }
    })

    req.on('close', () => {
      proxyReq.destroy()
    })
  } catch (err) {
    logger.error('Proxy initialization error:', err.message)
    if (!res.headersSent) {
      proxyDirectUrl('https://vjs.zencdn.net/v/oceans.mp4', req, res)
    }
  }
}

// Helper to fetch and rewrite HLS M3U8 Playlists with automatic gzip/br decompression, VIP device verification & 3xx redirect following
const fetchM3u8Playlist = (targetUrl, customHeaders, req, res, redirectCount = 0, isVipUnlocked = true, previewLimit = 120) => {
  if (redirectCount > 5) {
    logger.error(`Too many redirects for M3U8: ${targetUrl}`)
    return proxyDirectUrl(targetUrl, req, res, customHeaders)
  }

  const cleanUrl = targetUrl.trim()
  const baseUrl = cleanUrl.substring(0, cleanUrl.lastIndexOf('/') + 1)

  try {
    const urlObj = new URL(cleanUrl)
    const finalHeaders = {
      'Host': urlObj.host,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      ...customHeaders
    }

    const protocol = cleanUrl.startsWith('https') ? https : http

    const proxyReq = protocol.get(cleanUrl, { headers: finalHeaders }, (streamRes) => {
      // 1. Follow 3xx Redirects
      if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
        const redirectUrl = streamRes.headers.location.startsWith('http')
          ? streamRes.headers.location
          : new URL(streamRes.headers.location, cleanUrl).href
        logger.info(`[HLS M3U8 Proxy] Following ${streamRes.statusCode} redirect to: ${redirectUrl}`)
        return fetchM3u8Playlist(redirectUrl, customHeaders, req, res, redirectCount + 1, isVipUnlocked, previewLimit)
      }

      // 2. Handle HTTP 4xx / 5xx Error Code
      if (streamRes.statusCode >= 400) {
        logger.warn(`HLS M3U8 Upstream returned HTTP ${streamRes.statusCode} for ${cleanUrl}, falling back to direct stream.`)
        return proxyDirectUrl(cleanUrl, req, res, customHeaders)
      }

      // 3. Transparently Decompress Response Bodies
      let responseStream = streamRes
      const encoding = streamRes.headers['content-encoding']
      if (encoding === 'gzip') {
        responseStream = streamRes.pipe(zlib.createGunzip())
      } else if (encoding === 'deflate') {
        responseStream = streamRes.pipe(zlib.createInflate())
      } else if (encoding === 'br') {
        responseStream = streamRes.pipe(zlib.createBrotliDecompress())
      }

      let m3u8Data = ''
      responseStream.on('data', chunk => m3u8Data += chunk.toString('utf8'))
      responseStream.on('end', () => {
        if (res.headersSent) return

        if (!m3u8Data.includes('#EXTM3U')) {
          logger.warn(`Upstream returned non-M3U8 data for ${cleanUrl}, falling back to direct stream.`)
          return proxyDirectUrl(cleanUrl, req, res, customHeaders)
        }

        const lines = m3u8Data.split('\n')
        const rewrittenLines = []
        let currentDuration = 0

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const trimmed = line.trim()

          // 1. 处理 #EXTINF 切片时长标签，同时做 VIP 截断
          if (trimmed.startsWith('#EXTINF:')) {
            const match = trimmed.match(/#EXTINF:([\d.]+)/)
            if (match) {
              const segDur = parseFloat(match[1]) || 0
              if (!isVipUnlocked && previewLimit > 0 && (currentDuration + segDur) > previewLimit) {
                rewrittenLines.push('#EXT-X-ENDLIST')
                break
              }
              currentDuration += segDur
            }
            // 【关键】必须把 #EXTINF 这行推入数组！
            rewrittenLines.push(line)
          }

          // 2. 处理 CMAF/DASH 初始化头 (#EXT-X-MAP)
          else if (trimmed.startsWith('#EXT-X-MAP:')) {
            const mapMatch = trimmed.match(/URI="([^"]+)"/)
            if (mapMatch) {
              const initUri = mapMatch[1]
              const absoluteInitUrl = new URL(initUri, cleanUrl).href
              const deviceIdParam = req.query.deviceId ? `&deviceId=${encodeURIComponent(req.query.deviceId)}` : ''

              const proxyInitUrl = `/api/v1/proxy/video?id=${req.query.id || ''}${deviceIdParam}&url=${encodeURIComponent(absoluteInitUrl)}`
              rewrittenLines.push(`#EXT-X-MAP:URI="${proxyInitUrl}"`)
            } else {
              rewrittenLines.push(line)
            }
          }

          // 3. 其他所有以 '#' 开头的配置标签或空行，原样保留
          else if (!trimmed || trimmed.startsWith('#')) {
            rewrittenLines.push(line)
          }

          // 4. 真正的切片 URL，重写为后端代理
          else {
            const segUrl = new URL(trimmed, cleanUrl).href
            const deviceIdParam = req.query.deviceId ? `&deviceId=${encodeURIComponent(req.query.deviceId)}` : ''
            rewrittenLines.push(`/api/v1/proxy/video?id=${req.query.id || ''}${deviceIdParam}&url=${encodeURIComponent(segUrl)}`)
          }
        }

        const rewritten = rewrittenLines.join('\n')

        res.writeHead(200, {
          'Content-Type': 'application/x-mpegURL',
          'Access-Control-Allow-Origin': '*'
        })
        res.end(rewritten)
      })

      responseStream.on('error', (err) => {
        logger.error('Decompression / stream error:', err.message)
        if (!res.headersSent) {
          proxyDirectUrl(cleanUrl, req, res, customHeaders)
        }
      })
    })

    proxyReq.on('error', (err) => {
      if (err.message.includes('socket hang up') && redirectCount < 2 && !res.headersSent) {
        logger.info(`[HLS M3U8 Proxy] Transient socket hang up, retrying fresh connection (${redirectCount + 1}/2)...`)
        return fetchM3u8Playlist(cleanUrl, customHeaders, req, res, redirectCount + 1, isVipUnlocked, previewLimit)
      }
      logger.error('HLS m3u8 request error:', err.message)
      if (!res.headersSent) {
        proxyDirectUrl(cleanUrl, req, res, customHeaders)
      }
    })

    req.on('close', () => {
      proxyReq.destroy()
    })
  } catch (e) {
    logger.error('M3U8 initialization error:', e.message)
    if (!res.headersSent) {
      proxyDirectUrl(cleanUrl, req, res, customHeaders)
    }
  }
}

// GET /api/v1/proxy/video?url=...&id=...&deviceId=...&headers=...
app.get('/api/v1/proxy/video', async (req, res) => {
  let targetUrl = req.query.url ? req.query.url.trim() : null
  let customHeaders = {}
  const deviceId = (req.query.deviceId || req.headers['x-device-id'] || '').trim()

  let isVipUnlocked = false
  let previewLimit = 120

  if (deviceId) {
    const vipInfo = db.getDeviceVip(deviceId)
    isVipUnlocked = Boolean(vipInfo && vipInfo.isVip)
  }

  if (req.query.id) {
    const video = db.getVideoById(req.query.id)
    if (video) {
      previewLimit = video.previewDuration !== undefined && video.previewDuration !== null ? Number(video.previewDuration) : 120

      // 后端核心 VIP 权限防御校验 (Backend Core VIP Security Check)
      if (video.isVip && !isVipUnlocked && previewLimit <= 0) {
        logger.warn(`[Security Alert] Non-VIP device (${deviceId || 'No-ID'}) blocked from streaming VIP video ${video.id}`)
        return sendResponse(res, null, 403, '该视频为 VIP 独家专享内容，您的设备未开通 VIP 权限！')
      }

      if (!targetUrl) targetUrl = video.videoUrl ? video.videoUrl.trim() : null
      if (video.headers) {
        customHeaders = normalizeHeaders(video.headers)
      }
    }
  }

  if (req.query.headers) {
    const parsed = normalizeHeaders(req.query.headers)
    customHeaders = { ...customHeaders, ...parsed }
  }

  if (!targetUrl) {
    return sendResponse(res, null, 400, 'Missing video url query parameter')
  }

  // Handle local server uploaded video files (/uploads/...)
  if (targetUrl.startsWith('/uploads/') || targetUrl.includes('/uploads/')) {
    const fileName = targetUrl.split('/uploads/').pop()
    const localFilePath = path.join(uploadsDir, fileName)
    if (fs.existsSync(localFilePath)) {
      return res.sendFile(localFilePath)
    }
  }

  if (targetUrl.includes('.m3u8')) {
    return fetchM3u8Playlist(targetUrl, customHeaders, req, res, 0, isVipUnlocked, previewLimit)
  }

  const match = targetUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)
  const videoId = match ? match[1] : null

  if (videoId || ytdl.validateURL(targetUrl)) {
    const youtubeFullUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : targetUrl

    try {
      const info = await ytdl.getInfo(youtubeFullUrl)
      const format = ytdl.chooseFormat(info.formats, {
        quality: 'highest',
        filter: (f) => f.container === 'mp4' && f.hasVideo
      })

      if (format && format.url) {
        return proxyDirectUrl(format.url, req, res, customHeaders)
      }
    } catch (err) {
      logger.warn(`Dynamic YouTube resolution fallback for ${youtubeFullUrl}:`, err.message)
    }

    return proxyDirectUrl('https://vjs.zencdn.net/v/oceans.mp4', req, res, customHeaders)
  }

  proxyDirectUrl(targetUrl, req, res, customHeaders)
})

/**
 * Extract the 50th frame (select=eq(n\,49)) from videoUrl using ffmpeg
 */
const generateFrame50Poster = (videoUrl, customHeaders = {}) => {
  if (!videoUrl) return Promise.resolve('')

  const hash = crypto.createHash('md5').update(videoUrl).digest('hex')
  const posterFilename = `poster_frame50_${hash}.jpg`
  const outputPath = path.join(postersDir, posterFilename)
  const publicUrl = `/uploads/posters/${posterFilename}`

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    return Promise.resolve(publicUrl)
  }

  return new Promise((resolve) => {
    let cleanUrl = videoUrl.trim()

    // Handle local server uploaded video files
    if (cleanUrl.startsWith('/uploads/') || cleanUrl.includes('/uploads/')) {
      const fileName = cleanUrl.split('/uploads/').pop()
      const localFilePath = path.join(uploadsDir, fileName)
      if (fs.existsSync(localFilePath)) {
        cleanUrl = localFilePath
      }
    }

    // Construct FFmpeg arguments
    const ffmpegArgs = []

    if (customHeaders && Object.keys(customHeaders).length > 0) {
      let headersHeaderStr = ''
      for (const [k, v] of Object.entries(customHeaders)) {
        if (k.toLowerCase() === 'user-agent') {
          ffmpegArgs.push('-user_agent', v)
        } else if (k.toLowerCase() === 'referer') {
          ffmpegArgs.push('-headers', `Referer: ${v}\r\n`)
        } else {
          headersHeaderStr += `${k}: ${v}\r\n`
        }
      }
      if (headersHeaderStr) {
        ffmpegArgs.push('-headers', headersHeaderStr)
      }
    }

    // Capture the 50th frame (n=49) from the video
    ffmpegArgs.push(
      '-i', cleanUrl,
      '-vf', 'select=eq(n\\,49)',
      '-vframes', '1',
      '-y',
      outputPath
    )

    logger.info(`[Poster Generator 🎬] Extracting 50th frame via FFmpeg from: ${cleanUrl}`)
    const ff = spawn('ffmpeg', ffmpegArgs)

    let stderr = ''
    if (ff.stderr) {
      ff.stderr.on('data', (d) => { stderr += d.toString() })
    }

    ff.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        logger.info(`[Poster Generator 🎬] Successfully generated 50th frame poster: ${publicUrl}`)
        resolve(publicUrl)
      } else {
        logger.warn(`[Poster Generator 🎬] Frame 50 extraction returned exit code ${code}, attempting fallback frame 0 / 1s...`)
        const fallbackArgs = ['-ss', '00:00:01', '-i', cleanUrl, '-vframes', '1', '-y', outputPath]
        const ffFb = spawn('ffmpeg', fallbackArgs)
        ffFb.on('close', (fbCode) => {
          if (fbCode === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            logger.info(`[Poster Generator 🎬] Fallback poster generated: ${publicUrl}`)
            resolve(publicUrl)
          } else {
            logger.error(`[Poster Generator 🎬] Poster generation failed for ${cleanUrl}`)
            resolve('')
          }
        })
      }
    })

    ff.on('error', (err) => {
      logger.error(`[Poster Generator 🎬] FFmpeg spawn error: ${err.message}`)
      resolve('')
    })
  })
}

// GET /api/v1/proxy/poster?id=...&url=...&headers=...
app.get('/api/v1/proxy/poster', async (req, res) => {
  const { id, url: rawUrl, headers: rawHeaders } = req.query
  let targetUrl = rawUrl ? rawUrl.trim() : null
  let customHeaders = {}

  if (id) {
    const video = db.getVideoById(id)
    if (video) {
      if (video.poster && video.poster.trim() && !video.poster.includes('/api/v1/proxy/poster')) {
        if (video.poster.startsWith('/uploads/')) {
          const localPath = path.join(__dirname, '../public', video.poster)
          if (fs.existsSync(localPath)) {
            return res.sendFile(localPath)
          }
        }
      }
      if (!targetUrl && video.videoUrl) {
        targetUrl = video.videoUrl.trim()
      }
      if (video.headers) {
        customHeaders = normalizeHeaders(video.headers)
      }
    }
  }

  if (rawHeaders) {
    customHeaders = { ...customHeaders, ...normalizeHeaders(rawHeaders) }
  }

  if (!targetUrl) {
    return sendResponse(res, null, 400, 'Missing video url or id parameter')
  }

  const posterUrl = await generateFrame50Poster(targetUrl, customHeaders)
  if (posterUrl && posterUrl.startsWith('/uploads/')) {
    const localPath = path.join(__dirname, '../public', posterUrl)
    if (fs.existsSync(localPath)) {
      if (id) {
        try {
          db.updateVideoPoster(id, posterUrl)
        } catch (e) {
          // ignore
        }
      }
      return res.sendFile(localPath)
    }
  }

  res.redirect('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop')
})

// -------------------------------------------------------------
// Dynamic Log Level Management Endpoint (Supports Query & Body)
// -------------------------------------------------------------

app.all('/api/v1/admin/loglevel', (req, res) => {
  let targetLevel = req.query.level || (req.body && req.body.level) || (typeof req.body === 'string' ? req.body : null)

  if (req.method === 'GET' && !targetLevel) {
    return sendResponse(res, { level: logger.getLevel() })
  }

  if (!targetLevel) {
    return sendResponse(res, null, 400, 'Missing level parameter (e.g. ?level=debug or body {"level":"debug"})')
  }

  targetLevel = targetLevel.trim().replace(/^['"]|['"]$/g, '')
  const success = logger.setLevel(targetLevel)

  if (success) {
    return sendResponse(res, { level: logger.getLevel() }, 200, `Log level updated to ${logger.getLevel()}`)
  }

  sendResponse(res, null, 400, 'Invalid log level (supported: debug, info, warn, error)')
})

// -------------------------------------------------------------
// C端 Client APIs
// -------------------------------------------------------------

app.get('/api/v1/videos', (req, res) => {
  const { filter, tag } = req.query
  const videoList = db.getVideos({ filter, tag })
  sendResponse(res, videoList)
})

app.get('/api/v1/tags', (req, res) => {
  const tags = db.getAllTags()
  sendResponse(res, tags)
})

app.get('/api/v1/videos/tag/:tag', (req, res) => {
  const { tag } = req.params
  const videoList = db.getVideos({ tag })
  sendResponse(res, videoList)
})

app.get('/api/v1/videos/:id', (req, res) => {
  const video = db.getVideoById(req.params.id)
  if (!video) {
    return sendResponse(res, null, 404, 'Video not found')
  }
  sendResponse(res, video)
})

app.post('/api/v1/videos/:id/like', (req, res) => {
  const video = db.getVideoById(req.params.id)
  if (video) {
    video.likes += 1
    return sendResponse(res, { likes: video.likes })
  }
  sendResponse(res, null, 404, 'Video not found')
})

app.get('/api/v1/settings', (req, res) => {
  sendResponse(res, db.getSettings())
})

app.get('/api/v1/notice', (req, res) => {
  const settings = db.getSettings()
  const title = settings.noticeTitle || '📢 官方重要公告'
  const content = settings.noticeContent || ''

  const str = title + '|' + content
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  const noticeHash = 'nh_' + Math.abs(hash).toString(36)

  sendResponse(res, {
    enableNotice: Boolean(settings.enableNotice),
    noticeTitle: title,
    noticeContent: content,
    hash: noticeHash
  })
})

// Local File Upload API (Support uploading local MP4 videos, covers, and hero GIFs)
app.post('/api/v1/upload', (req, res) => {
  try {
    const { filename, fileData, contentBase64 } = req.body || {}
    if (!filename || (!fileData && !contentBase64)) {
      return sendResponse(res, null, 400, '缺少 filename 或文件内容数据 (fileData / contentBase64)')
    }

    const base64Str = contentBase64 || fileData.replace(/^data:[^;]+;base64,/, '')
    const buffer = Buffer.from(base64Str, 'base64')

    const ext = path.extname(filename) || '.bin'
    const safeName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`
    const filePath = path.join(uploadsDir, safeName)

    fs.writeFileSync(filePath, buffer)

    const publicUrl = `/uploads/${safeName}`
    logger.info(`[Upload] File saved to server: ${publicUrl} (${buffer.length} bytes)`)

    sendResponse(res, {
      url: publicUrl,
      originalName: filename,
      size: buffer.length
    })
  } catch (e) {
    logger.error('[Upload] File save error:', e.message)
    sendResponse(res, null, 500, '服务器文件保存失败: ' + e.message)
  }
})

app.get('/api/v1/paywall/config', (req, res) => {
  const plans = db.getPlans()
  sendResponse(res, { plans })
})

app.post('/api/v1/paywall/order', (req, res) => {
  const order = db.createOrder(req.body)
  sendResponse(res, order)
})

// Helper function to build Alipay WAP Payment URL using Node's native RSA2 crypto
function generateAlipayWapUrl({ appId, privateKey, notifyUrl, orderId, amount, subject }) {
  if (!appId || !privateKey) {
    return `https://openapi.alipay.com/gateway.do?mock_order_id=${orderId}&amount=${amount}`
  }

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const bizContent = JSON.stringify({
    out_trade_no: orderId,
    total_amount: Number(amount).toFixed(2),
    subject: subject || 'VIP 订阅服务',
    product_code: 'QUICK_WAP_WAY'
  })

  const params = {
    app_id: appId,
    method: 'alipay.trade.wap.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp,
    version: '1.0',
    notify_url: notifyUrl,
    biz_content: bizContent
  }

  const sortedKeys = Object.keys(params).sort()
  const signContent = sortedKeys.map(k => `${k}=${params[k]}`).join('&')

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signContent, 'utf8')
  const formattedKey = privateKey.includes('-----BEGIN')
    ? privateKey
    : `-----BEGIN RSA PRIVATE KEY-----\n${privateKey}\n-----END RSA PRIVATE KEY-----`

  const sign = signer.sign(formattedKey, 'base64')
  const queryStr = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')

  return `https://openapi.alipay.com/gateway.do?${queryStr}&sign=${encodeURIComponent(sign)}`
}

// Verify Alipay Notify Callback RSA2 Signature
function verifyAlipayNotifySign(params, alipayPublicKey) {
  if (!alipayPublicKey) return true
  const { sign, sign_type, ...rest } = params
  if (!sign) return false

  const sortedKeys = Object.keys(rest).sort()
  const signContent = sortedKeys.map(k => `${k}=${rest[k]}`).join('&')

  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(signContent, 'utf8')

  const formattedPubKey = alipayPublicKey.includes('-----BEGIN')
    ? alipayPublicKey
    : `-----BEGIN PUBLIC KEY-----\n${alipayPublicKey}\n-----END PUBLIC KEY-----`

  return verifier.verify(formattedPubKey, sign, 'base64')
}

// Public Site Config (Includes siteTitle, hero settings, notice, etc.)
app.get(['/api/v1/site-config', '/api/v1/paywall/config', '/api/v1/settings'], (req, res) => {

  const settings = db.getSettings()
  sendResponse(res, {
    siteTitle: settings.siteTitle || 'StreamVIP - 独家超清视频流与VIP特权',
    heroImageUrl: settings.heroImageUrl,
    heroTitle: settings.heroTitle,
    heroSubtitle: settings.heroSubtitle,
    enableNotice: settings.enableNotice === 'true' || settings.enableNotice === true,
    noticeTitle: settings.noticeTitle,
    noticeContent: settings.noticeContent,
    enableSeekPreview: settings.enableSeekPreview === 'true' || settings.enableSeekPreview === true,
    paywallNotice: settings.paywallNotice,
    userAgreement: settings.userAgreement,
    customerServiceText: settings.customerServiceText
  })
})

// VIP Device Status Query
app.get('/api/v1/paywall/vip-status', (req, res) => {

  const { deviceId } = req.query
  const vipInfo = db.getDeviceVip(deviceId)
  sendResponse(res, vipInfo)
})

// Cancel / Revoke Device VIP Status
app.all(['/api/v1/paywall/vip/cancel', '/api/v1/paywall/vip-cancel'], (req, res) => {
  const deviceId = req.params.deviceId || req.body?.deviceId || req.query?.deviceId
  if (!deviceId) {
    return sendResponse(res, null, 400, '缺失 deviceId 参数')
  }
  const cleanId = String(deviceId).trim()
  db.revokeDeviceVip(cleanId)
  sendResponse(res, { success: true, deviceId: cleanId }, 200, '设备 VIP 权限已成功取消')
})


// Create Alipay Order & Pay URL
app.post('/api/v1/paywall/alipay/create', (req, res) => {
  const { planId, deviceId } = req.body
  const settings = db.getSettings()
  const order = db.createOrder({
    planId,
    deviceId,
    payType: 'alipay',
    status: 'PENDING'
  })

  const payUrl = generateAlipayWapUrl({
    appId: settings.alipayAppId,
    privateKey: settings.alipayPrivateKey,
    notifyUrl: settings.alipayNotifyUrl || 'http://localhost:3000/api/v1/paywall/alipay/notify',
    orderId: order.id,
    amount: order.amount,
    subject: order.planName
  })

  sendResponse(res, { orderId: order.id, payUrl, amount: order.amount })
})

// Alipay Notify Callback Webhook
app.post('/api/v1/paywall/alipay/notify', (req, res) => {
  const params = req.body
  const settings = db.getSettings()

  const isValid = verifyAlipayNotifySign(params, settings.alipayPublicKey)
  if (!isValid) {
    logger.warn('Alipay notify signature verification failed')
    return res.status(400).send('fail')
  }

  const orderId = params.out_trade_no
  const tradeNo = params.trade_no
  const totalAmount = Number(params.total_amount)
  const tradeStatus = params.trade_status

  if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
    const order = db.getOrderById(orderId)
    if (order && Math.abs(order.amount - totalAmount) < 0.01) {
      db.completeOrder(orderId, tradeNo)
      logger.info(`Alipay order completed successfully: ${orderId}, tradeNo: ${tradeNo}`)
      return res.send('success')
    }
  }

  res.send('fail')
})

// Create Crypto USDT Payment Order with Micro-Decimal Auto-Offset
app.post('/api/v1/paywall/crypto/create', (req, res) => {
  const { planId, deviceId } = req.body
  const settings = db.getSettings()
  const rate = Number(settings.cryptoExchangeRate) || 7.2

  const plans = db.getPlans()
  const plan = plans.find(p => p.id === planId || p.key === planId) || plans[0]
  const cnyAmount = plan ? plan.price : 39
  const baseCryptoAmount = Number((cnyAmount / rate).toFixed(2))

  // Micro-decimal collision prevention (e.g. User A = 5.4201 USDT, User B = 5.4202 USDT)
  const existingOrders = db.getOrders().filter(o => o.payType === 'crypto_usdt' && o.status === 'PENDING')
  const usedAmounts = new Set(existingOrders.map(o => Number(o.cryptoAmount || 0).toFixed(4)))

  let offset = 0
  let finalCryptoAmount = baseCryptoAmount
  while (usedAmounts.has(finalCryptoAmount.toFixed(4))) {
    offset += 0.0001
    finalCryptoAmount = Number((baseCryptoAmount + offset).toFixed(4))
  }

  const usdtAddress = settings.cryptoUsdtAddress || 'TY7x9N2m8Qk4Pz1v6W3s5R7u9Y2X4B6C8V'


  const order = db.createOrder({
    planId: plan ? plan.id : planId,
    deviceId,
    payType: 'crypto_usdt',
    status: 'PENDING',
    cryptoAddress: usdtAddress,
    cryptoAmount: finalCryptoAmount
  })

  sendResponse(res, {
    orderId: order.id,
    usdtAddress,
    cryptoAmount: finalCryptoAmount,
    baseCryptoAmount,
    cnyAmount,
    network: 'TRC-20 (TRON)',
    createdAt: order.createdAt
  })
})

// Restore VIP using Order Number
app.post('/api/v1/paywall/restore', (req, res) => {
  const { orderId, deviceId } = req.body
  if (!orderId || !deviceId) {
    return sendResponse(res, null, 400, '订单号和设备标识不能为空')
  }

  const result = db.restoreVipByOrder(orderId.trim(), deviceId.trim())
  if (result.success) {
    sendResponse(res, result, 200, result.message)
  } else {
    sendResponse(res, null, 400, result.message)
  }
})

// -------------------------------------------------------------
// B端 Admin APIs
// -------------------------------------------------------------

app.post('/api/v1/admin/auth/login', (req, res) => {
  const { username, password } = req.body
  const expectedUsername = process.env.ADMIN_USERNAME || 'admin'
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const jwtSecret = process.env.JWT_SECRET || 'jwt-token-admin-secret-888'

  if (username === expectedUsername && password === expectedPassword) {
    return sendResponse(res, {
      token: jwtSecret,
      user: { username: expectedUsername, role: 'SUPER_ADMIN' }
    })
  }
  sendResponse(res, null, 401, '用户名或密码错误')
})


app.get('/api/v1/admin/settings', (req, res) => {
  sendResponse(res, db.getSettings())
})

app.put('/api/v1/admin/settings', (req, res) => {
  const updated = db.updateSettings(req.body)
  sendResponse(res, updated, 200, '系统配置保存成功')
})

app.get('/api/v1/admin/dashboard/stats', (req, res) => {
  const stats = db.getStats()
  sendResponse(res, stats)
})

// -------------------------------------------------------------
// 数据分析与日志管理 APIs (Analytics & Access Log APIs)
// -------------------------------------------------------------

// C端访问与点击数据上报
app.post('/api/v1/analytics/track', (req, res) => {
  const clientIp = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip || '127.0.0.1').split(',')[0].trim()

  const { path, videoId, action, deviceId, userAgent, referer } = req.body || {}

  const result = db.recordAccess({
    ip: clientIp,
    userAgent: userAgent || req.headers['user-agent'] || '',
    referer: referer || req.headers['referer'] || '',
    path: path || '/',
    videoId,
    action: action || 'PV',
    deviceId,
    headers: req.headers
  })

  sendResponse(res, result)
})

// B端数据分析概览 (PV/UV/IP/点击量)
app.get('/api/v1/admin/analytics/overview', (req, res) => {
  const data = db.getAnalyticsOverview()
  sendResponse(res, data)
})

// B端近7天/24小时访问趋势图
app.get('/api/v1/admin/analytics/trend', (req, res) => {
  const days = Number(req.query.days) || 7
  const data = db.getAnalyticsTrend(days)
  sendResponse(res, data)
})

// B端热门视频点击排行榜 Top 10
app.get('/api/v1/admin/analytics/top-videos', (req, res) => {
  const limit = Number(req.query.limit) || 10
  const data = db.getTopVideos(limit)
  sendResponse(res, data)
})

// B端实时访问日志与 GeoIP 来源列表
app.get('/api/v1/admin/analytics/logs', (req, res) => {
  const { page, pageSize, ip, action } = req.query
  const data = db.getAccessLogs({ page, pageSize, ip, action })
  sendResponse(res, data)
})

// B端日志管理 API (支持按条件清理，默认保留不删除)
app.delete('/api/v1/admin/analytics/logs', (req, res) => {
  const { beforeDate, clearAll } = req.body || req.query || {}
  const result = db.clearAccessLogs({ beforeDate, clearAll: clearAll === 'true' || clearAll === true })
  sendResponse(res, result, 200, '日志管理操作完成')
})

app.get('/api/v1/admin/videos', (req, res) => {
  const videos = db.getVideos()
  sendResponse(res, videos)
})

app.post('/api/v1/admin/videos', (req, res) => {
  const newVideo = db.addVideo(req.body)
  sendResponse(res, newVideo, 201, '视频创建成功')
})

app.put('/api/v1/admin/videos/:id', (req, res) => {
  const updated = db.updateVideo(req.params.id, req.body)
  if (!updated) {
    return sendResponse(res, null, 404, '视频不存在')
  }
  sendResponse(res, updated, 200, '视频更新成功')
})

app.delete('/api/v1/admin/videos/:id', (req, res) => {
  const success = db.deleteVideo(req.params.id)
  if (success) {
    return sendResponse(res, { success: true }, 200, '视频已删除')
  }
  sendResponse(res, null, 404, '视频不存在')
})

app.get('/api/v1/admin/paywall/plans', (req, res) => {
  sendResponse(res, db.getPlans())
})

app.put('/api/v1/admin/paywall/plans', (req, res) => {
  const updatedPlans = db.updatePlans(req.body.plans)
  sendResponse(res, updatedPlans, 200, '套餐修改成功')
})

app.get('/api/v1/admin/orders', (req, res) => {
  sendResponse(res, db.getOrders())
})

app.delete('/api/v1/admin/orders/:id', (req, res) => {
  const success = db.deleteOrder(req.params.id)
  if (success) {
    return sendResponse(res, { success: true }, 200, '订单记录已成功删除')
  }
  sendResponse(res, null, 404, '订单不存在或已被删除')
})

// Admin Confirm Crypto Order (Manual/Webhook)
app.post('/api/v1/admin/orders/:id/confirm-crypto', (req, res) => {
  const { tradeNo } = req.body
  const order = db.completeOrder(req.params.id, tradeNo || `USDT-TX-${Date.now()}`)
  if (order) {
    return sendResponse(res, order, 200, '加密货币订单已确认充值并成功开通 VIP')
  }
  sendResponse(res, null, 404, '订单不存在')
})

// Admin Manual Grant/Restore VIP
app.post('/api/v1/admin/orders/:id/grant-vip', (req, res) => {
  const { deviceId } = req.body
  const order = db.getOrderById(req.params.id)
  if (!order) return sendResponse(res, null, 404, '未找到订单')
  const targetDevice = deviceId || order.deviceId
  if (!targetDevice) return sendResponse(res, null, 400, '缺失设备 ID')

  const resVip = db.grantDeviceVip(targetDevice, order.planId, order.id)
  sendResponse(res, resVip, 200, '手动充值/恢复 VIP 权限成功')
})

// Admin Manual Grant/Restore VIP by Device ID
app.post('/api/v1/admin/devices/:deviceId/grant-vip', (req, res) => {
  const { deviceId } = req.params
  const { planId = 'month' } = req.body || {}
  const resVip = db.grantDeviceVip(deviceId, planId)
  sendResponse(res, resVip, 200, '设备 VIP 权限手动充值/赠送成功')
})

// Admin Manual Revoke/Cancel Device VIP (Support URL param, query param, and body)
app.all(['/api/v1/admin/devices/:deviceId/revoke-vip', '/api/v1/admin/devices/revoke-vip'], (req, res) => {
  const deviceId = req.params.deviceId || req.body?.deviceId || req.query?.deviceId
  if (!deviceId) {
    return sendResponse(res, null, 400, '缺失 deviceId 参数')
  }
  const cleanId = String(deviceId).trim()
  db.revokeDeviceVip(cleanId)
  return sendResponse(res, { success: true, deviceId: cleanId }, 200, '手动取消设备 VIP 成功')
})

const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } })

// GET /api/v1/admin/storage/status - Get Active Storage Node Health Status
app.get('/api/v1/admin/storage/status', async (req, res) => {
  const defaultNode = db.getDefaultStorageNode()
  const storageNodeUrl = defaultNode.baseUrl || 'http://localhost:3001'

  try {
    const response = await fetch(`${storageNodeUrl}/api/v1/storage/status`)
    if (response.ok) {
      const data = await response.json()
      return sendResponse(res, data.data || data)
    }
  } catch (err) {
    logger.warn(`Storage Node status check failed for ${storageNodeUrl}:`, err.message)
  }

  sendResponse(res, {
    nodeId: defaultNode.id || 'node-01',
    nodeName: defaultNode.name || '存储节点 01',
    status: 'OFFLINE',
    baseUrl: storageNodeUrl,
    message: 'Storage Node connection failed'
  })
})

const verifyClusterHmacSignature = (req, secret) => {
  const timestamp = req.get('X-Cluster-Timestamp')
  const nonce = req.get('X-Cluster-Nonce')
  const signature = req.get('X-Cluster-Signature')

  if (timestamp && nonce && signature) {
    const now = Date.now()
    const reqTime = Number(timestamp)
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
      return { valid: false, reason: 'HMAC 请求已过期（超过 5 分钟），防重放攻击校验拦截' }
    }

    const bodyString = JSON.stringify(req.body)
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${bodyString}.${timestamp}.${nonce}`)
      .digest('hex')

    if (signature !== expectedSig) {
      return { valid: false, reason: 'HMAC-SHA256 签名解密匹配失败' }
    }
    return { valid: true, mode: 'HMAC-SHA256' }
  }

  const reqSecret = req.body?.clusterSecret || req.get('Authorization')?.replace('Bearer ', '')
  if (reqSecret === secret) {
    return { valid: true, mode: 'TOKEN' }
  }

  return { valid: false, reason: '请求缺少 HMAC 签名请求头且密钥匹配失败' }
}

// Storage Node Auto-Registration Endpoint (Called by storage-nodes on startup)
app.post('/api/v1/storage-nodes/register', (req, res) => {
  const { id, name, baseUrl, isDefault } = req.body
  if (!id || !baseUrl) {
    return sendResponse(res, null, 400, '节点 ID 和 Base URL 不能为空')
  }

  const configuredSecret = process.env.CLUSTER_SECRET || 'streamvip-cluster-secret'
  const auth = verifyClusterHmacSignature(req, configuredSecret)
  if (!auth.valid) {
    return sendResponse(res, null, 401, `存储节点自动注册校验失败: ${auth.reason}`)
  }

  logger.info(`[Node Auto-Register] Received authenticated auto-registration (${auth.mode}) from storage node [${name || id}] (${id}) -> ${baseUrl}`)
  const node = db.upsertStorageNode({ id, name, baseUrl, isDefault })
  sendResponse(res, node, 200, `存储节点 [${node.name}] 已通过 ${auth.mode} 安全校验成功注册上线！`)
})

// Storage Node Heartbeat Endpoint (Called periodically by storage-nodes)
app.post('/api/v1/storage-nodes/heartbeat', (req, res) => {
  const { id, status, videoCount, freeSpace } = req.body
  if (!id) {
    return sendResponse(res, null, 400, '节点 ID 不能为空')
  }

  const configuredSecret = process.env.CLUSTER_SECRET || 'streamvip-cluster-secret'
  const auth = verifyClusterHmacSignature(req, configuredSecret)
  if (!auth.valid) {
    return sendResponse(res, null, 401, `存储节点心跳保活校验失败: ${auth.reason}`)
  }

  const node = db.updateStorageNodeHeartbeat(id, { status: status || 'ONLINE', videoCount, freeSpace })
  if (!node) {
    return sendResponse(res, null, 404, '节点未注册')
  }
  sendResponse(res, { status: 'ACK', nodeId: id }, 200, '心跳接收成功')
})

// Storage Node Management APIs
app.get('/api/v1/admin/storage-nodes', async (req, res) => {
  const nodes = db.getStorageNodes()
  const results = await Promise.all(
    nodes.map(async (n) => {
      let isOnline = false
      let videoCount = 0
      const cleanBase = (n.baseUrl || '').replace(/\/$/, '')
      try {
        if (cleanBase) {
          const resp = await fetch(`${cleanBase}/api/v1/storage/status`, { signal: AbortSignal.timeout(3000) })
          if (resp.ok) {
            const json = await resp.json()
            isOnline = true
            videoCount = json.data?.videoCount || 0
          }
        }
      } catch (e) {
        isOnline = false
      }
      return {
        ...n,
        status: isOnline ? 'HEALTHY' : 'UNHEALTHY',
        isOnline,
        videoCount
      }
    })
  )
  sendResponse(res, results)
})

app.post('/api/v1/admin/storage-nodes', (req, res) => {
  const { id, name, baseUrl, isDefault } = req.body
  if (!id || !name || !baseUrl) {
    return sendResponse(res, null, 400, '节点 ID、名称和 Base URL 均不能为空')
  }
  const node = db.addStorageNode({ id, name, baseUrl, isDefault })
  sendResponse(res, node, 200, '新存储节点注册成功')
})

app.put('/api/v1/admin/storage-nodes/:id', (req, res) => {
  const node = db.updateStorageNode(req.params.id, req.body)
  if (!node) return sendResponse(res, null, 404, '未找到存储节点')
  sendResponse(res, node, 200, '存储节点信息已更新')
})

app.delete('/api/v1/admin/storage-nodes/:id', (req, res) => {
  db.deleteStorageNode(req.params.id)
  sendResponse(res, { success: true }, 200, '存储节点已成功注销/删除')
})

app.post('/api/v1/admin/storage-nodes/:id/set-default', (req, res) => {
  const node = db.setDefaultStorageNode(req.params.id)
  if (!node) return sendResponse(res, null, 404, '未找到存储节点')
  sendResponse(res, node, 200, `存储节点 [${node.name}] 已成功设为默认上传节点`)
})

// GET /api/v1/admin/stats - Overview statistics (total revenue strictly from PAID orders)
app.get('/api/v1/admin/stats', (_req, res) => {
  const orders = db.getOrders() || []
  const paidOrders = orders.filter(o => o.status === 'PAID' || o.status === 'SUCCESS' || o.paid === true)

  const totalRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
  const paidOrderCount = paidOrders.length

  sendResponse(res, {
    totalRevenue,
    paidOrderCount,
    totalOrderCount: orders.length
  }, 200, 'Dashboard stats retrieved')
})

// POST /api/v1/admin/login - Admin authentication login endpoint
app.post('/api/v1/admin/login', (req, res) => {
  const { username, password } = req.body || {}
  const expectedUsername = process.env.ADMIN_USERNAME || 'admin'
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123'

  if (username === expectedUsername && password === expectedPassword) {
    logger.info(`[Admin Auth] Admin user [${username}] logged in successfully`)
    return sendResponse(res, {
      username,
      isLoggedIn: true,
      token: 'admin-token-' + Date.now()
    }, 200, '登录成功')
  }

  logger.warn(`[Admin Auth] Failed login attempt for user [${username}]`)
  return sendResponse(res, null, 401, '管理员账号或密码错误')
})

// GET /api/v1/admin/upload-config - Check if direct upload mode is enabled
app.get('/api/v1/admin/upload-config', (req, res) => {
  const enableDirectUpload = process.env.ENABLE_DIRECT_UPLOAD !== 'false'
  sendResponse(res, { enableDirectUpload }, 200, 'Upload config retrieved')
})

// GET /api/v1/admin/debug - System Debug Diagnostic Endpoint
app.get('/api/v1/admin/debug', async (req, res) => {
  const isCloudflare = !!(req.headers['cf-ray'] || req.headers['cf-connecting-ip'])
  const nodes = db.getStorageNodes() || []
  
  const nodeProbes = await Promise.all(
    nodes.map(async (n) => {
      const cleanBase = (n.baseUrl || '').replace(/\/$/, '')
      let isReachable = false
      let details = null
      try {
        if (cleanBase) {
          const r = await fetch(`${cleanBase}/api/v1/storage/status`, { signal: AbortSignal.timeout(2000) })
          isReachable = r.ok
          if (r.ok) details = await r.json()
        }
      } catch (e) {
        details = e.message
      }
      return { id: n.id, name: n.name, baseUrl: n.baseUrl, isReachable, details }
    })
  )

  sendResponse(res, {
    server: {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      logLevel: logger.getLevel(),
      isDebugMode: logger.isLevelEnabled('debug'),
      enableDirectUpload: process.env.ENABLE_DIRECT_UPLOAD !== 'false',
      hasClusterSecret: !!process.env.CLUSTER_SECRET
    },
    proxy: {
      isCloudflareProxy: isCloudflare,
      cfRay: req.headers['cf-ray'] || null,
      cfConnectingIp: req.headers['cf-connecting-ip'] || null,
      clientIp: req.ip || req.socket?.remoteAddress,
      maxUploadNotes: isCloudflare
        ? '⚠️ 检测到 Cloudflare 代理！Cloudflare 免费版对 POST 请求强加 100MB 限制。如需上传大文件，必须使用【浏览器 4 通道切片直传模式】(Direct Chunk Upload) 或关闭 Cloudflare 小黄云 CDN 代理。'
        : '🟢 直接 Nginx/VPS 连接，上传限制受 Nginx client_max_body_size (建议 2000M) 约束。'
    },
    storageNodes: nodeProbes
  }, 200, '系统 DEBUG 诊断报告已生成')
})

// POST /api/v1/admin/videos/upload-ticket - Generate Direct Upload Ticket for target storage node
app.post('/api/v1/admin/videos/upload-ticket', (req, res) => {
  const enableDirectUpload = process.env.ENABLE_DIRECT_UPLOAD !== 'false'
  const targetNodeId = req.body.nodeId || req.query.nodeId
  let targetNode = targetNodeId ? db.getStorageNodeById(targetNodeId) : db.getDefaultStorageNode()
  if (!targetNode) {
    targetNode = db.getDefaultStorageNode()
  }
  if (!targetNode) {
    return sendResponse(res, null, 404, '无可用存储节点')
  }

  const configuredSecret = process.env.CLUSTER_SECRET || 'streamvip-cluster-secret'
  const timestamp = Date.now().toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const payloadStr = JSON.stringify({ nodeId: targetNode.id, timestamp })
  const signature = crypto
    .createHmac('sha256', configuredSecret)
    .update(`${payloadStr}.${timestamp}.${nonce}`)
    .digest('hex')

  const baseUrl = targetNode.baseUrl || 'http://localhost:3001'
  const cleanBase = baseUrl.replace(/\/$/, '')
  const uploadUrl = `${cleanBase}/api/v1/storage/upload`
  const chunkUploadUrl = `${cleanBase}/api/v1/storage/upload-chunk`
  const mergeUrl = `${cleanBase}/api/v1/storage/merge-chunks`

  sendResponse(res, {
    enableDirectUpload,
    storageNodeId: targetNode.id,
    storageNodeName: targetNode.name,
    baseUrl: cleanBase,
    uploadUrl,
    chunkUploadUrl,
    mergeUrl,
    headers: {
      'X-Cluster-Timestamp': timestamp,
      'X-Cluster-Nonce': nonce,
      'X-Cluster-Signature': signature
    }
  }, 200, '直传凭证生成成功')
})

// POST /api/v1/admin/videos/upload - Upload video file directly to specified Storage Node
app.post('/api/v1/admin/videos/upload', uploadMemory.single('video'), async (req, res) => {
  if (!req.file) {
    return sendResponse(res, null, 400, '未检测到上传视频文件（表单字段名应为 video）')
  }

  const targetNodeId = req.body.nodeId || req.query.nodeId
  let targetNode = targetNodeId ? db.getStorageNodeById(targetNodeId) : db.getDefaultStorageNode()
  if (!targetNode) {
    targetNode = db.getDefaultStorageNode()
  }

  const storageNodeUrl = (targetNode.baseUrl || 'http://localhost:3001').replace(/\/$/, '')

  try {
    logger.info(`[Admin Upload] Proxying video file (${(req.file.size / 1024 / 1024).toFixed(2)} MB) to Storage Node [${targetNode.name}] (${targetNode.id}): ${storageNodeUrl}`)

    const formData = new FormData()
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'video/mp4' })
    formData.append('video', blob, req.file.originalname)

    const response = await fetch(`${storageNodeUrl}/api/v1/storage/upload`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Storage Node HTTP ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    logger.info(`[Admin Upload] Storage Node response:`, result)

    if (result && result.data) {
      const dataWithNode = {
        ...result.data,
        storageNodeId: targetNode.id,
        storageNodeName: targetNode.name
      }
      return sendResponse(res, dataWithNode, 200, `视频已成功透传上传至存储节点 [${targetNode.name}]，第50帧封面已生成！`)
    }
    sendResponse(res, result, 200, '视频上传成功')
  } catch (err) {
    logger.error(`[Admin Upload] Proxy upload to storage node failed:`, err.message)
    sendResponse(res, null, 500, `上传至存储节点失败: ${err.message}`)
  }
})


app.listen(PORT, () => {
  logger.info(`🚀 Paywall Backend API Server listening on http://localhost:${PORT}`)
  logger.info(`📝 Current Log Level: [${logger.getLevel().toUpperCase()}]`)
})
