import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import http from 'http'
import https from 'https'
import zlib from 'zlib'
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

// Helper to fetch and rewrite HLS M3U8 Playlists with automatic gzip/br decompression and 3xx redirect following
const fetchM3u8Playlist = (targetUrl, customHeaders, req, res, redirectCount = 0) => {
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
      // 1. Follow 3xx Redirects (e.g. 301 Moved Permanently from HTTP to HTTPS or CDN redirect)
      if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
        const redirectUrl = streamRes.headers.location.startsWith('http')
          ? streamRes.headers.location
          : new URL(streamRes.headers.location, cleanUrl).href
        logger.info(`[HLS M3U8 Proxy] Following ${streamRes.statusCode} redirect to: ${redirectUrl}`)
        return fetchM3u8Playlist(redirectUrl, customHeaders, req, res, redirectCount + 1)
      }

      // 2. Handle HTTP 4xx / 5xx Error Code
      if (streamRes.statusCode >= 400) {
        logger.warn(`HLS M3U8 Upstream returned HTTP ${streamRes.statusCode} for ${cleanUrl}, falling back to direct stream.`)
        return proxyDirectUrl(cleanUrl, req, res, customHeaders)
      }

      // 3. Transparently Decompress Gzip / Deflate / Brotli Response Bodies
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

        // If non-M3U8 response (e.g. Cloudflare WAF challenge page)
        if (!m3u8Data.includes('#EXTM3U')) {
          logger.warn(`Upstream returned non-M3U8 data for ${cleanUrl}, falling back to direct stream.`)
          return proxyDirectUrl(cleanUrl, req, res, customHeaders)
        }

        const lines = m3u8Data.split('\n')
        const rewritten = lines.map(line => {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) return line
          const segUrl = trimmed.startsWith('http') ? trimmed : (baseUrl + trimmed)
          return `/api/v1/proxy/video?id=${req.query.id || ''}&url=${encodeURIComponent(segUrl)}`
        }).join('\n')

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
      // Automatic retry on transient Keep-Alive socket drops
      if (err.message.includes('socket hang up') && redirectCount < 2 && !res.headersSent) {
        logger.info(`[HLS M3U8 Proxy] Transient socket hang up, retrying fresh connection (${redirectCount + 1}/2)...`)
        return fetchM3u8Playlist(cleanUrl, customHeaders, req, res, redirectCount + 1)
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

// GET /api/v1/proxy/video?url=...&id=...&headers=...
app.get('/api/v1/proxy/video', async (req, res) => {
  let targetUrl = req.query.url ? req.query.url.trim() : null
  let customHeaders = {}

  if (req.query.id) {
    const video = db.getVideoById(req.query.id)
    if (video) {
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
    return fetchM3u8Playlist(targetUrl, customHeaders, req, res)
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
    deviceId
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


app.listen(PORT, () => {
  logger.info(`🚀 Paywall Backend API Server listening on http://localhost:${PORT}`)
  logger.info(`📝 Current Log Level: [${logger.getLevel().toUpperCase()}]`)
})
