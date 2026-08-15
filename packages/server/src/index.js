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
import { config } from './config.js'
import { logger, requestLoggerMiddleware } from './logger.js'
import { sendResponse } from './utils/response.js'
import { issueAdminToken, requireAdminAuth, adminAuthMiddleware } from './middleware/adminAuth.js'
import { hashPassword, verifyPassword, createUserToken, publicUser, requireUserAuth } from './middleware/userAuth.js'
import { rateLimit, ipKey } from './utils/rateLimit.js'
import { sendVerificationEmail } from './utils/mailer.js'
import { getCountryCode } from './geoip.js'
import paywallRouter from './routes/paywall.js'

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.set('trust proxy', true)
const PORT = config.port


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

// ─────────────────────────────────────────────────────────────────────────────
// Admin Session Auth (B端管理接口鉴权)
// ─────────────────────────────────────────────────────────────────────────────

// In-memory admin session tokens (revoked on server restart → re-login required)
// Admin auth (模块化: middleware/adminAuth.js)
app.use('/api/v1/admin', adminAuthMiddleware)
app.use('/api/v1/upload', requireAdminAuth)

// ─────────────────────────────────────────────────────────────────────────────
// Cluster HMAC Ticket Signing (主站 → 存储节点 双向鉴权凭证)
// payload = { nodeId, timestamp }, matches storage-node's verifyClusterTicketSignature
// ─────────────────────────────────────────────────────────────────────────────
const createClusterSignedHeaders = (nodeId) => {
  const configuredSecret = process.env.CLUSTER_SECRET || 'streamvip-cluster-secret'
  const timestamp = Date.now().toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const payloadStr = JSON.stringify({ nodeId, timestamp })
  const signature = crypto
    .createHmac('sha256', configuredSecret)
    .update(`${payloadStr}.${timestamp}.${nonce}`)
    .digest('hex')

  return {
    'X-Cluster-Timestamp': timestamp,
    'X-Cluster-Nonce': nonce,
    'X-Cluster-Signature': signature
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Single-Stream-Per-Device Guard
// 同一设备指纹（deviceId）同时只允许一条流式连接，新请求到来时主动终止旧连接
// ─────────────────────────────────────────────────────────────────────────────

/**
 * activeStreams: Map<deviceId, { proxyReq: http.ClientRequest, res: express.Response, videoId: string }>
 * 保存每个设备当前正在进行的代理连接
 */
const activeStreams = new Map()

/**
 * 如果设备当前有活跃的代理连接，主动终止并清除
 * @param {string} deviceId
 */
const abortActiveStream = (deviceId) => {
  if (!deviceId) return
  const existing = activeStreams.get(deviceId)
  if (existing) {
    try {
      if (existing.proxyReq && !existing.proxyReq.destroyed) {
        existing.proxyReq.destroy()
      }
    } catch (e) { /* ignore */ }
    try {
      if (existing.res && !existing.res.writableEnded) {
        existing.res.end()
      }
    } catch (e) { /* ignore */ }
    activeStreams.delete(deviceId)
    logger.info(`[StreamGuard] 设备 ${deviceId} 的旧流已主动终止 (videoId: ${existing.videoId || 'N/A'})`)
  }
}

// Helper to proxy direct media/fragment stream with Range & Custom Request Headers
const proxyDirectUrl = (videoUrl, req, res, customHeaders = {}, retryCount = 0, deviceId = null) => {
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

      // 连接建立后，将此条流登许到 activeStreams
      if (deviceId) {
        activeStreams.set(deviceId, { proxyReq, res, videoId: req.query.id || null })
        logger.info(`[StreamGuard] 设备 ${deviceId} 开始拉流 (videoId: ${req.query.id || 'N/A'}, url: ${cleanUrl.substring(0, 80)}...)`)
      }

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

      // 流结束后从活跃表中清除
      const cleanupStream = () => {
        if (deviceId && activeStreams.get(deviceId)?.proxyReq === proxyReq) {
          activeStreams.delete(deviceId)
          logger.info(`[StreamGuard] 设备 ${deviceId} 拉流完成，已释放占用`)
        }
      }
      streamRes.on('end', cleanupStream)
      streamRes.on('error', cleanupStream)
      res.on('finish', cleanupStream)
      res.on('close', cleanupStream)
    })

    proxyReq.on('error', (err) => {
      // Automatic retry on transient Keep-Alive socket drops
      if (err.message.includes('socket hang up') && retryCount < 2 && !res.headersSent) {
        logger.info(`[Proxy Direct Stream] Transient socket hang up, retrying fresh connection (${retryCount + 1}/2)...`)
        return proxyDirectUrl(cleanUrl, req, res, customHeaders, retryCount + 1, deviceId)
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

  // ── Single-Stream-Per-Device Guard ──────────────────────────────────────────
  // 终止同一设备的上一条流式连接（如果有）
  if (deviceId) {
    abortActiveStream(deviceId)
  }
  // ────────────────────────────────────────────────────────────────────────────

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
        return proxyDirectUrl(format.url, req, res, customHeaders, 0, deviceId)
      }
    } catch (err) {
      logger.warn(`Dynamic YouTube resolution fallback for ${youtubeFullUrl}:`, err.message)
    }

    return proxyDirectUrl('https://vjs.zencdn.net/v/oceans.mp4', req, res, customHeaders, 0, deviceId)
  }

  proxyDirectUrl(targetUrl, req, res, customHeaders, 0, deviceId)
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
    // ffmpeg 缺失/启动失败：不抛 Uncaught Exception，回退空海报
    ff.on('error', (err) => {
      logger.error('[Poster Generator] FFmpeg spawn error: ' + err.message)
      resolve('')
    })

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
        ffFb.on('error', (err) => {
          logger.error('[Poster Generator] FFmpeg fallback spawn error: ' + err.message)
          resolve('')
        })
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
  // search：关键词搜索（标题/描述/创作者），兼容 q 别名
  const search = req.query.search || req.query.q || null
  const page = req.query.page ? parseInt(req.query.page) : 1
  const limit = req.query.limit ? parseInt(req.query.limit) : 10
  const result = db.getVideos({ filter, tag, search, page, limit, lang: req.query.lang })
  sendResponse(res, result)
})

app.get('/api/v1/tags', (req, res) => {
  const tags = db.getAllTags()
  sendResponse(res, tags)
})

// GET /api/v1/ads?placement=feed&vip=0|1 - 获取指定广告位当前生效的广告
// placement: feed(信息流) / preroll(前贴片) / midroll(中插)；vip=1 表示请求方是 VIP（跳过仅免费用户的广告）
app.get('/api/v1/ads', (req, res) => {
  const placement = req.query.placement || 'feed'
  const isVip = req.query.vip === '1' || req.query.vip === 'true'
  const ads = db.getAds({ placement, isVip })
  sendResponse(res, ads)
})

// GET /api/v1/menus - 全站导航菜单树（管理侧配置；未配置时返回默认菜单：全部视频 + 最热 tag）
app.get('/api/v1/menus', (req, res) => {
  sendResponse(res, db.getMenuTree(req.query.lang || null))
})

app.get('/api/v1/videos/suggest', (req, res) => {
  // 搜索实时建议（联想词）：q 必填，lang 多语言，limit 默认 8 上限 20
  const q = String(req.query.q || '').trim().slice(0, 50)
  const lang = req.query.lang || null
  const limit = Math.min(parseInt(req.query.limit) || 8, 20)
  const suggestions = q ? db.suggestVideos(q, lang, limit) : []
  sendResponse(res, suggestions)
})

// ── 用户认证（评论身份体系）────────────────────────────────
// 注册：邮箱 + 密码（≥8 位）
// - EMAIL_VERIFICATION_ENABLED=false：一步注册即登录
// - 默认开启：两步（发验证码 → /auth/verify 激活）；未配 RESEND_API_KEY 时响应带 devCode 便于本机联调
app.post('/api/v1/auth/register',
  rateLimit({ windowMs: 60000, max: 5, keyFn: ipKey, message: '注册过于频繁，请稍后再试' }),
  async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const nickname = String(req.body?.nickname || '').trim().slice(0, 24)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendResponse(res, null, 400, '邮箱格式不正确')
    }
    if (password.length < 8) return sendResponse(res, null, 400, '密码至少 8 位')
    if (db.findUserByEmail(email)) return sendResponse(res, null, 409, '该邮箱已注册')

    // 开关关闭：一步注册即登录（原逻辑）
    if (!config.emailVerificationEnabled) {
      const user = db.createUser({
        email,
        passwordHash: hashPassword(password),
        nickname: nickname || email.split('@')[0]
      })
      const { token, expiresAt } = createUserToken(user.id)
      return sendResponse(res, { user: publicUser(user), token, expiresAt }, 201, '注册成功')
    }

    // 开启验证：生成 6 位验证码 → 暂存注册信息 → 发邮件
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
    const expiresAt = new Date(Date.now() + 5 * 60000).toISOString()
    db.upsertEmailVerification({ email, code, passwordHash: hashPassword(password), nickname: nickname || email.split('@')[0], expiresAt })
    let sent = null
    try {
      sent = await sendVerificationEmail({ to: email, code })
    } catch (e) {
      console.warn('[Mailer] 验证码发送失败:', e.message)
    }
    const data = { requiresVerification: true, email }
    if (sent?.devMode) data.devCode = code // 仅开发模式（未配 key）暴露，便于本机测试
    sendResponse(res, data, 200, sent ? '验证码已发送，请查收邮箱' : '验证码发送失败，请稍后再试')
  }
)

// 验证码确认 → 创建用户并登录
app.post('/api/v1/auth/verify',
  rateLimit({
    windowMs: 60000, max: 10,
    keyFn: (req) => `${ipKey(req)}|${String(req.body?.email || '').trim().toLowerCase()}`,
    message: '尝试过于频繁，请稍后再试'
  }),
  (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const code = String(req.body?.code || '').trim()
    if (!/^\d{6}$/.test(code)) return sendResponse(res, null, 400, '验证码格式不正确')
    const pending = db.getEmailVerification(email)
    if (!pending || pending.verifiedAt) return sendResponse(res, null, 400, '请先获取验证码')
    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      return sendResponse(res, null, 400, '验证码已过期，请重新获取')
    }
    if (pending.attempts >= 5) return sendResponse(res, null, 429, '尝试次数过多，请重新获取验证码')
    if (pending.code !== code) {
      db.incrementVerificationAttempts(email)
      return sendResponse(res, null, 400, '验证码错误')
    }

    // 激活：创建用户 + 签发 token + 清理验证码记录
    const user = db.createUser({ email, passwordHash: pending.password_hash, nickname: pending.nickname })
    db.clearEmailVerification(email)
    const { token, expiresAt } = createUserToken(user.id)
    sendResponse(res, { user: publicUser(user), token, expiresAt }, 201, '注册成功')
  }
)

// 登录：统一错误文案防账号枚举
app.post('/api/v1/auth/login',
  rateLimit({
    windowMs: 60000, max: 10,
    keyFn: (req) => `${ipKey(req)}|${String(req.body?.email || '').trim().toLowerCase()}`,
    message: '尝试过于频繁，请稍后再试'
  }),
  (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const user = db.findUserByEmail(email)
    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendResponse(res, null, 401, '邮箱或密码错误')
    }
    if (user.status !== 'active') return sendResponse(res, null, 403, '账号已被禁用')
    const { token, expiresAt } = createUserToken(user.id)
    sendResponse(res, { user: publicUser(user), token, expiresAt }, 200, '登录成功')
  }
)

// 登出：吊销当前会话
app.post('/api/v1/auth/logout', requireUserAuth, (req, res) => {
  db.deleteSession(req.user.tokenHash)
  sendResponse(res, { success: true }, 200, '已退出登录')
})

// 当前登录用户信息
app.get('/api/v1/auth/me', requireUserAuth, (req, res) => {
  sendResponse(res, publicUser(req.user))
})

// ── 评论（登录后发表，防滥评）──────────────────────────────
// 评论列表（公开，游客可看）
app.get('/api/v1/videos/:id/comments', (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = Math.min(parseInt(req.query.limit) || 20, 50)
  sendResponse(res, db.getCommentsByVideo(req.params.id, page, limit))
})

// 发表评论（登录 + 限流：每用户 10 条/分钟）
app.post('/api/v1/videos/:id/comments',
  requireUserAuth,
  rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => `cmt:${req.user.id}`, message: '评论太频繁了，歇会儿再聊' }),
  (req, res) => {
    const content = String(req.body?.content || '').trim()
    if (!content) return sendResponse(res, null, 400, '评论内容不能为空')
    if (content.length > 500) return sendResponse(res, null, 400, '评论最多 500 字')
    const comment = db.addComment({ videoId: req.params.id, userId: req.user.id, content })
    sendResponse(res, comment, 201, '评论成功')
  }
)

// 删除自己的评论
app.delete('/api/v1/comments/:id', requireUserAuth, (req, res) => {
  const ok = db.deleteComment(req.params.id, req.user.id)
  if (!ok) return sendResponse(res, null, 404, '评论不存在或无权删除')
  sendResponse(res, { success: true }, 200, '评论已删除')
})

app.get('/api/v1/videos/tag/:tag', (req, res) => {
  const { tag } = req.params
  const videoList = db.getVideos({ tag, lang: req.query.lang })
  sendResponse(res, videoList)
})

app.get('/api/v1/videos/:id', (req, res) => {
  const video = db.getVideoById(req.params.id, req.query.lang)
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
  // 公开接口只暴露 C 端展示所需配置项，绝不返回支付私钥等敏感字段
  const settings = db.getSettings(req.query.lang)
  sendResponse(res, {
    paywallEnabled: settings.paywallEnabled === true || settings.paywallEnabled === 'true',
    adsEnabled: settings.adsEnabled === true || settings.adsEnabled === 'true',
    adsFeedInterval: Number(settings.adsFeedInterval) || 6,
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

app.get('/api/v1/notice', (req, res) => {
  const settings = db.getSettings(req.query.lang)
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

// ---- Paywall routes (模块化: routes/paywall.js) ----
app.use('/api/v1/paywall', paywallRouter)// Public Site Config (Includes siteTitle, hero settings, notice, etc.)
app.get(['/api/v1/site-config', '/api/v1/paywall/config', '/api/v1/settings'], (req, res) => {

  const settings = db.getSettings(req.query.lang)
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
    customerServiceText: settings.customerServiceText,
    // i18n 文案覆盖（白标定制）：仅返回当前语言有覆盖的 key，前端 mergeLocaleMessage 合并
    i18n: db.getSiteI18nOverrides(req.query.lang),
    // C 端调试日志开关（管理端控制）
    enableClientDebug: settings.enableClientDebug === true,
  })
})

// B端 Admin APIs
// -------------------------------------------------------------

app.post('/api/v1/admin/auth/login', (req, res) => {
  const { username, password } = req.body
  const expectedUsername = process.env.ADMIN_USERNAME || 'admin'
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123'

  if (username === expectedUsername && password === expectedPassword) {
    return sendResponse(res, {
      token: issueAdminToken(),
      user: { username: expectedUsername, role: 'SUPER_ADMIN' }
    }, 200, '登录成功')
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

app.post('/api/v1/admin/settings', (req, res) => {
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
// -------------------------------------------------------------
// Analytics V1 APIs
// -------------------------------------------------------------

const ANALYTICS_EVENT_NAMES = new Set([
  'PAGE_VIEW',
  'VIDEO_START',
  'VIDEO_2S',
  'VIDEO_25',
  'VIDEO_50',
  'VIDEO_75',
  'VIDEO_COMPLETE',
  'WATCH_TIME',
  'PAYWALL_OPEN',
  'AD_REQUEST',
  'AD_FILLED',
  'AD_RENDERED',
  'AD_VIEWABLE',
  'AD_CLICK',
  'AD_COMPLETE'
])

const analyticsRateLimits = new Map()
const ANALYTICS_RATE_WINDOW_MS = 60_000
const ANALYTICS_RATE_LIMIT = 600

const readClientIp = (req) => String(
  req.headers['cf-connecting-ip'] ||
  req.headers['x-forwarded-for'] ||
  req.headers['x-real-ip'] ||
  req.socket?.remoteAddress ||
  req.ip ||
  '127.0.0.1'
).split(',')[0].replace(/^::ffff:/, '').trim()

const clampAnalyticsNumber = (value, max) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.min(number, max)
}

const cleanAnalyticsText = (value, maxLength) => {
  if (value === undefined || value === null) return ''
  return String(value).slice(0, maxLength)
}

const normalizeAnalyticsEvent = (event, requestContext) => {
  if (!event || typeof event !== 'object') return null

  const eventId = cleanAnalyticsText(event.eventId, 100)
  const eventName = cleanAnalyticsText(event.eventName, 40)
  const visitorId = cleanAnalyticsText(event.visitorId, 100)
  const sessionId = cleanAnalyticsText(event.sessionId, 100)
  const pageViewId = cleanAnalyticsText(event.pageViewId, 100)
  if (!eventId || !ANALYTICS_EVENT_NAMES.has(eventName) || !visitorId || !sessionId || !pageViewId) {
    return null
  }

  const occurredDate = new Date(event.occurredAt)
  const occurredAt = Number.isNaN(occurredDate.getTime())
    ? requestContext.receivedAt
    : occurredDate.toISOString()
  const properties = event.properties && typeof event.properties === 'object' && !Array.isArray(event.properties)
    ? event.properties
    : {}
  if (JSON.stringify(properties).length > 2048) return null

  return {
    eventId,
    eventName,
    occurredAt,
    receivedAt: requestContext.receivedAt,
    visitorId,
    sessionId,
    pageViewId,
    playbackId: cleanAnalyticsText(event.playbackId, 100) || null,
    videoId: cleanAnalyticsText(event.videoId, 100) || null,
    path: cleanAnalyticsText(event.path, 500) || '/',
    watchSeconds: clampAnalyticsNumber(event.watchSeconds, 60),
    positionSeconds: clampAnalyticsNumber(event.positionSeconds, 86_400),
    durationSeconds: clampAnalyticsNumber(event.durationSeconds, 86_400),
    userAgent: requestContext.userAgent,
    referer: requestContext.referer,
    ipHash: requestContext.ipHash,
    clientIp: requestContext.clientIp || '',
    countryCode: requestContext.countryCode,
    properties,
    isValid: true,
    invalidReason: null
  }
}

app.post('/api/v1/events/batch', async (req, res) => {
  // 总开关：ANALYTICS_ENABLED=false 时直接拒绝上报（默认开）
  if (!config.analytics.enabled) {
    return sendResponse(res, null, 403, 'analytics disabled')
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : null
  if (!events || events.length === 0 || events.length > 50) {
    return sendResponse(res, null, 400, 'events must contain between 1 and 50 items')
  }

  const clientIp = readClientIp(req)
  const now = Date.now()
  const currentLimit = analyticsRateLimits.get(clientIp)
  const rateLimit = !currentLimit || now - currentLimit.startedAt >= ANALYTICS_RATE_WINDOW_MS
    ? { startedAt: now, count: events.length }
    : { ...currentLimit, count: currentLimit.count + events.length }
  analyticsRateLimits.set(clientIp, rateLimit)
  if (analyticsRateLimits.size > 10_000) {
    for (const [ip, value] of analyticsRateLimits) {
      if (now - value.startedAt >= ANALYTICS_RATE_WINDOW_MS) analyticsRateLimits.delete(ip)
    }
  }
  if (rateLimit.count > ANALYTICS_RATE_LIMIT) {
    return sendResponse(res, null, 429, 'analytics rate limit exceeded')
  }

  const receivedAt = new Date().toISOString()
  const ipSalt = process.env.ANALYTICS_IP_SALT || process.env.CLUSTER_SECRET || 'local-analytics-salt'
  // GeoIP 解析：只取 ISO 国家码（地理画像）；失败返回 '' 不阻塞入库
  // 开关：ANALYTICS_GEOIP_ENABLED=false 时跳过外部解析；ANALYTICS_STORE_RAW_IP=true 时始终存原始 IP
  // 数据兜底（硬性要求）：国家码解析失败时，必须记录真实 IP，保证管理端数据一条不丢
  const countryCode = config.analytics.geoipEnabled
    ? await getCountryCode(clientIp)
    : ''
  const requestContext = {
    receivedAt,
    ipHash: crypto.createHash('sha256').update(`${ipSalt}:${clientIp}`).digest('hex'),
    // 存真实 IP 的条件：显式开启 storeRawIp，或国家码解析失败（无法归属地域时用 IP 兜底可追溯）
    clientIp: (config.analytics.storeRawIp || !countryCode) ? clientIp : '',
    userAgent: cleanAnalyticsText(req.headers['user-agent'], 500),
    referer: cleanAnalyticsText(req.headers.referer, 1000),
    countryCode
  }
  const normalized = events
    .map(event => normalizeAnalyticsEvent(event, requestContext))
    .filter(Boolean)
  const rejected = events.length - normalized.length

  try {
    const result = db.recordAnalyticsEvents(normalized)
    return sendResponse(res, { ...result, rejected })
  } catch (error) {
    logger.error('Analytics batch insert failed:', error.message)
    return sendResponse(res, null, 500, 'analytics batch insert failed')
  }
})

app.get('/api/v1/admin/analytics/v1/overview', (req, res) => {
  sendResponse(res, db.getAnalyticsV1Overview())
})

app.get('/api/v1/admin/analytics/v1/report', (req, res) => {
  sendResponse(res, db.getAnalyticsV1Report(req.query.days))
})

// 数据分析报表 CSV 导出（鉴权保护，用于对账/审计/投放分析）
app.get('/api/v1/admin/analytics/v1/export.csv', (req, res) => {
  const type = ['daily', 'videos', 'paths', 'countries'].includes(req.query.type) ? req.query.type : 'daily'
  const days = req.query.days
  const rows = db.getAnalyticsV1ExportData(type, days)
  const headers = type === 'videos'
    ? ['date', 'videoId', 'title', 'starts', 'validViews', 'completes', 'watchSeconds']
    : type === 'paths'
      ? ['date', 'path', 'pv', 'uv']
      : type === 'countries'
        ? ['date', 'countryCode', 'pv', 'uv']
        : ['date', 'pv', 'uv', 'starts', 'validViews', 'progress25', 'progress50', 'progress75', 'completes', 'watchSeconds', 'validEvents', 'totalEvents']
  const escapeCell = value => {
    const text = String(value ?? '')
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = [headers.join(','), ...rows.map(row => headers.map(key => escapeCell(row[key])).join(','))].join('\r\n')
  const dateStamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="analytics-${type}-${dateStamp}.csv"`)
  res.send(`\uFEFF${csv}`)
})

// 重建日聚合（清空聚合表并按原始事件回放；用于初始化或口径修复后的全量重算）
app.post('/api/v1/admin/analytics/v1/rebuild', (req, res) => {
  try {
    sendResponse(res, db.rebuildDailyAggregates())
  } catch (error) {
    logger.error('Analytics rebuild failed:', error.message)
    sendResponse(res, null, 500, 'analytics rebuild failed')
  }
})

// Legacy C-side analytics endpoint. Retained for compatibility.
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
  // includeScheduled：管理端可见全部（含待发布的 SCHEDULED 队列），C 端接口默认隐藏
  const videos = db.getVideos({ includeScheduled: true })
  sendResponse(res, videos)
})

// ── 广告管理（CRUD）──────────────────────────────────────────────────────
app.get('/api/v1/admin/ads', (req, res) => {
  sendResponse(res, db.getAllAds())
})

app.post('/api/v1/admin/ads', (req, res) => {
  const ad = db.addAd(req.body)
  sendResponse(res, ad, 201, '广告已创建')
})

app.put('/api/v1/admin/ads/:id', (req, res) => {
  const updated = db.updateAd(req.params.id, req.body)
  if (!updated) {
    return sendResponse(res, null, 404, '广告不存在')
  }
  sendResponse(res, updated, 200, '广告已更新')
})

app.delete('/api/v1/admin/ads/:id', (req, res) => {
  const success = db.deleteAd(req.params.id)
  if (!success) {
    return sendResponse(res, null, 404, '广告不存在')
  }
  sendResponse(res, { success: true }, 200, '广告已删除')
})

// ── 菜单管理（CRUD）──────────────────────────────────────────────────────
// ── 上传任务队列（上传即入队；可编辑/取消；取消时删除已上传文件）──
app.get('/api/v1/admin/upload-tasks', (req, res) => {
  sendResponse(res, db.getUploadTasks())
})

app.post('/api/v1/admin/upload-tasks', (req, res) => {
  // fileUrl 可选：允许「先建任务占位，后上传文件」
  const { fileName, fileUrl, posterUrl } = req.body || {}
  if (!fileUrl && !fileName) return sendResponse(res, null, 400, '缺少任务信息（fileName / fileUrl）')
  const task = db.createUploadTask({ fileName, fileUrl: fileUrl || '', posterUrl })
  sendResponse(res, task, 201, '已加入上传任务队列')
})

app.put('/api/v1/admin/upload-tasks/:id', (req, res) => {
  const updated = db.updateUploadTask(req.params.id, req.body || {})
  if (!updated) return sendResponse(res, null, 404, '任务不存在')
  sendResponse(res, updated, 200, '任务已更新')
})

/** 删除已上传文件（本地 uploads 直删；存储节点调 DELETE 接口） */
const removeUploadedFile = async (url) => {
  if (!url || typeof url !== 'string') return
  // 本地
  if (url.startsWith('/uploads/')) {
    const rel = url.slice('/uploads/'.length)
    const p = path.join(uploadsDir, rel)
    try { if (fs.existsSync(p)) { fs.unlinkSync(p); logger.info(`[Cleanup] 删除本地文件: ${rel}`) } } catch (e) { logger.warn('[Cleanup] 删除本地文件失败:', e.message) }
    return
  }
  // 存储节点 URL（如 https://host/uploads/videos/xxx.mp4）——定位节点并调删除
  try {
    const nodes = db.getStorageNodes()
    const target = nodes.find((nd) => nd.baseUrl && url.startsWith(nd.baseUrl))
    if (!target) return
    const rel = url.slice(url.indexOf('/uploads/'))
    const res = await fetch(`${target.baseUrl}/api/v1/storage/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...createClusterSignedHeaders(target.id || 'node-01') },
      body: JSON.stringify({ path: rel.replace(/^\/uploads\//, '') })
    }).catch(() => null)
    if (res && res.ok) logger.info(`[Cleanup] 存储节点删除文件: ${rel}`)
  } catch (e) { logger.warn('[Cleanup] 存储节点删除失败:', e.message) }
}

// 取消任务：删任务记录 + 删已上传文件（不再等 24h 孤儿回收）
app.delete('/api/v1/admin/upload-tasks/:id', async (req, res) => {
  const task = db.getUploadTask(req.params.id)
  if (!task) return sendResponse(res, null, 404, '任务不存在')
  db.deleteUploadTask(req.params.id)
  await removeUploadedFile(task.fileUrl)
  if (task.posterUrl) await removeUploadedFile(task.posterUrl)
  sendResponse(res, { success: true }, 200, '任务已取消，已上传文件已删除')
})

app.get('/api/v1/admin/menus', (req, res) => {
  sendResponse(res, db.getAllMenus())
})

app.post('/api/v1/admin/menus', (req, res) => {
  const body = req.body || {}
  if (body.type === 'link') {
    const url = String(body.target?.url || '').trim()
    if (!/^\/|^https?:\/\//.test(url)) {
      return sendResponse(res, null, 400, '链接格式不正确：站内路由以 / 开头，外链需 http(s)://')
    }
  }
  if (body.type === 'page' && !String(body.target?.pageKey || '').trim()) {
    return sendResponse(res, null, 400, 'page 类型需要 pageKey')
  }
  const menu = db.addMenu(body)
  const nameEn = String(body.nameEn || '').trim()
  if (nameEn) {
    db.saveTranslations({ entityType: 'menu', entityId: menu.id, locale: 'en', fields: { name: nameEn } })
  }
  sendResponse(res, menu, 201, '菜单已创建')
})

app.put('/api/v1/admin/menus/:id', (req, res) => {
  const body = req.body || {}
  if (body.type === 'link') {
    const url = String(body.target?.url || '').trim()
    if (!/^\/|^https?:\/\//.test(url)) {
      return sendResponse(res, null, 400, '链接格式不正确：站内路由以 / 开头，外链需 http(s)://')
    }
  }
  if (body.type === 'page' && !String(body.target?.pageKey || '').trim()) {
    return sendResponse(res, null, 400, 'page 类型需要 pageKey')
  }
  const updated = db.updateMenu(req.params.id, body)
  if (!updated) {
    return sendResponse(res, null, 404, '菜单不存在')
  }
  if (body.nameEn !== undefined) {
    const nameEn = String(body.nameEn || '').trim()
    if (nameEn) {
      db.saveTranslations({ entityType: 'menu', entityId: updated.id, locale: 'en', fields: { name: nameEn } })
    } else {
      db.deleteTranslation({ entityType: 'menu', entityId: updated.id, locale: 'en', field: 'name' })
    }
  }
  sendResponse(res, updated, 200, '菜单已更新')
})

app.delete('/api/v1/admin/menus/:id', (req, res) => {
  const success = db.deleteMenu(req.params.id)
  if (!success) {
    return sendResponse(res, null, 404, '菜单不存在')
  }
  sendResponse(res, { success: true }, 200, '菜单已删除')
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

// ── 异步后台上传（流程反转）：上传完成回填 + 状态流转 ────────────────────
// UPLOADING → (publishAt 未来 ? SCHEDULED : PUBLISHED)；关联 upload_task 自动置 completed
app.post('/api/v1/admin/videos/:id/upload-complete', (req, res) => {
  const { videoUrl, posterUrl, storageNodeId } = req.body || {}
  if (!videoUrl) {
    return sendResponse(res, null, 400, '缺少 videoUrl')
  }
  const updated = db.completeVideoUpload(req.params.id, { videoUrl, posterUrl, storageNodeId })
  if (!updated) {
    return sendResponse(res, null, 404, '视频不存在')
  }
  sendResponse(res, updated, 200, '上传完成，视频已上线')
})

// UPLOADING → FAILED（浏览器端上传中断/失败时上报）
app.post('/api/v1/admin/videos/:id/upload-failed', (req, res) => {
  const updated = db.failVideoUpload(req.params.id)
  if (!updated) {
    return sendResponse(res, null, 404, '视频不存在')
  }
  sendResponse(res, updated, 200, '已标记上传失败')
})

// FAILED → UPLOADING（重选文件重试）
app.post('/api/v1/admin/videos/:id/upload-retry', (req, res) => {
  const updated = db.retryVideoUpload(req.params.id)
  if (!updated) {
    return sendResponse(res, null, 404, '视频不存在')
  }
  sendResponse(res, updated, 200, '已重置为上传中')
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

const uploadMemory = null // 中转上传已改为流式透传（req.pipe），不再使用 multer 内存缓冲

// GET /api/v1/admin/storage/status - Get Active Storage Node Health Status
app.get('/api/v1/admin/storage/status', async (req, res) => {
  const defaultNode = db.getDefaultStorageNode()
  const storageNodeUrl = defaultNode.baseUrl || 'http://localhost:3001'

  try {
    const response = await fetch(`${storageNodeUrl}/api/v1/storage/status`, {
      headers: createClusterSignedHeaders(defaultNode.id || 'node-01')
    })
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
          const resp = await fetch(`${cleanBase}/api/v1/storage/status`, {
            headers: createClusterSignedHeaders(n.id),
            signal: AbortSignal.timeout(3000)
          })
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
  // 严格过滤：只统计状态为 PAID 的已完成支付订单，防水单/待支付混入
  const paidOrders = orders.filter(o => o.status === 'PAID')

  const totalRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
  const paidOrderCount = paidOrders.length

  sendResponse(res, {
    totalRevenue,
    paidOrderCount,
    totalOrderCount: orders.length
  }, 200, 'Dashboard stats retrieved')
})

// -------------------------------------------------------------
// i18n 翻译管理 APIs（动态内容多语言，通用翻译表抽象）
// -------------------------------------------------------------

// GET /api/v1/admin/translations - 查询译文（可按 entityType/entityId/locale 过滤）
app.get('/api/v1/admin/translations', (req, res) => {
  const { entityType, entityId, locale } = req.query
  const list = db.getTranslations({ entityType, entityId, locale })
  sendResponse(res, list, 200, 'Translations retrieved')
})

// PUT /api/v1/admin/translations - 批量保存译文
// body: { entityType: 'video'|'plan'|'site', entityId: 'vid-xxx'|'site', locale: 'en', fields: { title: '...', description: '...' } }
// 重复调用为更新（UNIQUE 约束），无副作用；新增语言只需换 locale
app.put('/api/v1/admin/translations', (req, res) => {
  const { entityType, entityId, locale, fields } = req.body || {}
  if (!entityType || entityId === undefined || entityId === null || !locale || !fields || typeof fields !== 'object') {
    return sendResponse(res, null, 400, '缺少 entityType / entityId / locale / fields 参数')
  }
  if (!db.TRANSLATABLE_FIELDS[entityType]) {
    return sendResponse(res, null, 400, `不支持的实体类型: ${entityType}（支持: ${Object.keys(db.TRANSLATABLE_FIELDS).join(', ')}）`)
  }
  const unknown = Object.keys(fields).filter(f => !db.TRANSLATABLE_FIELDS[entityType].includes(f))
  if (unknown.length > 0) {
    return sendResponse(res, null, 400, `不支持翻译的字段: ${unknown.join(', ')}（${entityType} 支持: ${db.TRANSLATABLE_FIELDS[entityType].join(', ')}）`)
  }
  const list = db.saveTranslations({ entityType, entityId: String(entityId), locale, fields })
  sendResponse(res, list, 200, `译文保存成功 (${entityType} / ${entityId} / ${locale})`)
})

// GET /api/v1/admin/translations/overview - 实体翻译状态概览（管理端列表用）
// ?entityType=video|plan|site → 每个实体 + 已录入译文摘要 { locale: [field...] }
app.get('/api/v1/admin/translations/overview', (req, res) => {
  const entityType = req.query.entityType || 'video'
  if (!db.TRANSLATABLE_FIELDS[entityType]) {
    return sendResponse(res, null, 400, `不支持的实体类型: ${entityType}`)
  }
  const overview = db.getTranslationOverview(entityType)
  sendResponse(res, overview, 200, 'Translation overview retrieved')
})
// GET /api/v1/admin/site-i18n - 全量文案覆盖（{ zh: {...}, en: {...} }）
app.get('/api/v1/admin/site-i18n', (req, res) => {
  sendResponse(res, db.getAllSiteI18nOverrides(), 200, 'Site i18n overrides retrieved')
})

// POST /api/v1/admin/site-i18n - 保存/更新一条覆盖（key + locale + value）
app.post('/api/v1/admin/site-i18n', (req, res) => {
  const key = String(req.body?.key || '').trim()
  const locale = String(req.body?.locale || '').trim()
  const value = String(req.body?.value ?? '').trim()
  if (!key || !/^[a-zA-Z0-9_.-]{1,100}$/.test(key)) {
    return sendResponse(res, null, 400, 'key 格式不正确（字母/数字/点/下划线/中划线）')
  }
  if (!locale) return sendResponse(res, null, 400, '缺少 locale')
  db.saveSiteI18nOverride({ key, locale, value })
  sendResponse(res, { key, locale, value }, 200, '文案覆盖已保存')
})

// DELETE /api/v1/admin/site-i18n - 删除覆盖（恢复默认文案）
app.delete('/api/v1/admin/site-i18n', (req, res) => {
  const key = String(req.query.key || '').trim()
  const locale = String(req.query.locale || '').trim()
  if (!key || !locale) return sendResponse(res, null, 400, '缺少 key / locale')
  const ok = db.deleteSiteI18nOverride({ key, locale })
  if (!ok) return sendResponse(res, null, 404, '覆盖不存在')
  sendResponse(res, { success: true }, 200, '已恢复默认文案')
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
      token: issueAdminToken()
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
          const r = await fetch(`${cleanBase}/api/v1/storage/status`, {
            headers: createClusterSignedHeaders(n.id),
            signal: AbortSignal.timeout(2000)
          })
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
    headers: createClusterSignedHeaders(targetNode.id)
  }, 200, '直传凭证生成成功')
})

// POST /api/v1/admin/videos/upload - 流式中转：浏览器 multipart 原样透传至存储节点（主控零落盘、零内存缓冲）
// 说明：不做 multer 解析，req 直接 pipe 到存储节点 /api/v1/storage/upload；
//       因此 nodeId 只能走 query 或自定义头（multipart body 无法在此读取）。
app.post('/api/v1/admin/videos/upload', (req, res) => {
  const targetNodeId = req.query.nodeId || req.headers['x-target-node']
  let targetNode = targetNodeId ? db.getStorageNodeById(targetNodeId) : db.getDefaultStorageNode()
  if (!targetNode) {
    targetNode = db.getDefaultStorageNode()
  }
  if (!targetNode || !targetNode.baseUrl) {
    return sendResponse(res, null, 503, '无可用存储节点')
  }

  const cleanBase = targetNode.baseUrl.replace(/\/$/, '')
  const targetUrl = new URL(`${cleanBase}/api/v1/storage/upload`)
  logger.info(`[Admin Upload] Streaming proxy video upload -> [${targetNode.name}] (${targetNode.id}): ${targetUrl.href}`)

  const headers = { ...createClusterSignedHeaders(targetNode.id) }
  // 透传浏览器原始 multipart Content-Type（含 boundary）与 Content-Length
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type']
  if (req.headers['content-length']) headers['Content-Length'] = req.headers['content-length']

  const lib = targetUrl.protocol === 'https:' ? https : http
  const proxyReq = lib.request(targetUrl, { method: 'POST', headers }, (proxyRes) => {
    res.status(proxyRes.statusCode)
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (k === 'transfer-encoding' || k === 'connection') continue
      res.setHeader(k, v)
    }
    proxyRes.pipe(res)
  })

  proxyReq.setTimeout(30 * 60 * 1000, () => proxyReq.destroy(new Error('proxy timeout')))
  proxyReq.on('error', (err) => {
    logger.error(`[Admin Upload] Streaming proxy failed:`, err.message)
    if (!res.headersSent) {
      return sendResponse(res, null, 502, `存储节点转发失败: ${err.message}`)
    }
    res.destroy()
  })

  req.on('aborted', () => proxyReq.destroy())
  req.pipe(proxyReq)
})


app.listen(PORT, () => {
  logger.info(`🚀 Paywall Backend API Server listening on http://localhost:${PORT}`)
  logger.info(`📝 Current Log Level: [${logger.getLevel().toUpperCase()}]`)
})
// ── 定时发布清扫任务 ──────────────────────────────────────────────────
// 每 30s 将已到时间的 SCHEDULED 视频刷为 PUBLISHED（C 端读取时也有懒晋升兜底）
// ── 孤儿上传文件清理（上传未提交/视频已删除 = 死档文件，24h 后自动清除）──
const ORPHAN_AGE_MS = 24 * 3600 * 1000

/** 收集所有被引用的上传文件相对路径（本地 /uploads/xxx → xxx；存储节点 …/uploads/videos/xxx → videos/xxx） */
const collectReferencedUploads = () => {
  const refs = new Set()
  const extract = (url) => {
    if (!url || typeof url !== 'string') return
    const m = url.match(/\/uploads\/(.+)$/)
    if (m) refs.add(m[1])
  }
  try {
    // includeScheduled: 定时发布(SCHEDULED)/后台上传(UPLOADING/FAILED) 的视频文件同样受引用保护，
    // 否则 24h 孤儿清理会把它们的已上传文件误删
    for (const v of db.getVideos({ includeScheduled: true })) {
      extract(v.videoUrl)
      extract(v.poster)
    }
    for (const a of db.getAllAds()) extract(a.imageUrl)
  } catch (e) {
    logger.warn('[Cleanup] 引用收集失败:', e.message)
  }
  return refs
}

/** 清理本地 uploads + 通知各存储节点清理；返回本地删除数 */
const cleanupOrphanUploads = async () => {
  const refs = collectReferencedUploads()
  const cutoff = Date.now() - ORPHAN_AGE_MS
  let removed = 0

  try {
    // 本地 uploads 根
    for (const name of fs.readdirSync(uploadsDir)) {
      const p = path.join(uploadsDir, name)
      const st = fs.statSync(p)
      if (st.isFile() && st.mtimeMs < cutoff && !refs.has(name)) {
        fs.unlinkSync(p)
        removed++
        logger.info(`[Cleanup] 删除本地孤儿文件: ${name}`)
      }
    }
    // 本地 posters（ffmpeg 抽帧生成；视频删除后成孤儿）
    for (const name of fs.readdirSync(postersDir)) {
      const p = path.join(postersDir, name)
      const st = fs.statSync(p)
      if (st.isFile() && st.mtimeMs < cutoff && !refs.has(`posters/${name}`)) {
        fs.unlinkSync(p)
        removed++
        logger.info(`[Cleanup] 删除本地孤儿海报: ${name}`)
      }
    }
  } catch (e) {
    logger.warn('[Cleanup] 本地清理失败:', e.message)
  }

  // 存储节点（直传模式的文件所在地）
  try {
    const nodes = db.getStorageNodes()
    for (const node of nodes) {
      if (!node.baseUrl) continue
      const res = await fetch(`${node.baseUrl}/api/v1/storage/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...createClusterSignedHeaders(node.id || 'node-01') },
        body: JSON.stringify({ referenced: [...refs] })
      }).catch(() => null)
      if (res && res.ok) {
        const j = await res.json().catch(() => null)
        if (j && j.data && j.data.count) {
          logger.info(`[Cleanup] 存储节点 [${node.name}] 清理 ${j.data.count} 个孤儿文件`)
        }
      } else {
        logger.warn(`[Cleanup] 存储节点 [${node.name || node.id}] 清理调用失败`)
      }
    }
  } catch (e) {
    logger.warn('[Cleanup] 存储节点清理失败:', e.message)
  }

  return removed
}

const publishScheduler = setInterval(() => {
  try {
    db.publishDueVideos()
  } catch (e) {
    logger.warn('[Scheduler] publishDueVideos error:', e.message)
  }
}, 30 * 1000)
publishScheduler.unref?.()

// 异步后台上传超时清扫：UPLOADING 超过 6h → FAILED（页面刷新/关闭导致上传中断后不永久悬挂）
const UPLOADING_STALE_MS = 6 * 3600 * 1000
const staleUploadScheduler = setInterval(() => {
  try {
    const n = db.failStaleUploads(UPLOADING_STALE_MS)
    if (n > 0) logger.warn(`[Scheduler] 标记 ${n} 个超时未完成的上传任务为 FAILED`)
  } catch (e) {
    logger.warn('[Scheduler] failStaleUploads error:', e.message)
  }
}, 60 * 1000)
staleUploadScheduler.unref?.()

// 孤儿文件清理：启动时跑一次，之后每 24 小时
const cleanupScheduler = setInterval(() => {
  cleanupOrphanUploads().catch(() => {})
}, 24 * 3600 * 1000)
cleanupScheduler.unref?.()
cleanupOrphanUploads().catch(() => {})
