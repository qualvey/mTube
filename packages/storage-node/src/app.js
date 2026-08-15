import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import { config, dirs, CHUNK_SIZE, HMAC_WINDOW_MS } from './config.js'
import { verifyClusterTicketSignature, originHostOf } from './auth.js'
import { generateFrame50Poster } from './ffmpeg.js'
import { resolvePublicBaseUrl, mediaUrl } from './cluster.js'
import {
  sanitizeUploadId,
  createSingleUpload,
  createChunkUpload,
  mergeChunksToFile,
  findInvalidChunks,
  persistMergeRecord,
} from './upload.js'

/**
 * Build the Express app (routes + middleware) for a storage node.
 * Exported separately from index.js so it can be unit-tested without listening.
 */
export const createApp = () => {
  const app = express()

  // ── Directory setup ──
  for (const dir of [dirs.videosDir, dirs.postersDir, dirs.tempChunksDir, dirs.mergeRecordsDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // ── Request debug tracing middleware ──
  app.use((req, res, next) => {
    const startTime = Date.now()
    const len = req.headers['content-length']
    const formattedLen = len ? `${(Number(len) / 1024 / 1024).toFixed(2)} MB` : 'N/A'

    if (config.isDebug) {
      console.log(`[DEBUG 🐞] ${req.method} ${req.originalUrl || req.url} | Payload: ${formattedLen} | IP: ${req.ip || req.socket?.remoteAddress}`)
    }

    res.on('finish', () => {
      const duration = Date.now() - startTime
      if (res.statusCode >= 400) {
        console.warn(`[WARN ⚠️] ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${duration}ms) [Payload: ${formattedLen}]`)
        if (res.statusCode === 413) {
          console.error(`[HTTP 413 ❌] Storage Node received payload exceeding limit (${formattedLen}). Check Nginx client_max_body_size 2000M.`)
        }
      } else if (config.isDebug) {
        console.log(`[DEBUG 🐞] ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${duration}ms)`)
      }
    })
    next()
  })

  // ── Global body parsers (only meaningful for JSON/urlencoded endpoints) ──
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Cluster-Timestamp', 'X-Cluster-Nonce', 'X-Cluster-Signature', 'X-Cluster-Scope'],
  }))
  app.use(express.json({ limit: '512kb' }))
  app.use(express.urlencoded({ limit: '512kb', extended: true }))

  // ── Cluster auth for ALL storage APIs ──
  app.use('/api/v1/storage', (req, res, next) => {
    const auth = verifyClusterTicketSignature(req, {
      secret: config.clusterSecret,
      nodeId: config.nodeId,
      allowedOrigins: config.allowedOrigins,
      windowMs: HMAC_WINDOW_MS,
    })
    if (auth.valid) return next()
    console.warn(`[Storage Node 🔒] Rejected ${req.method} ${req.originalUrl || req.url}: ${auth.reason}`)
    return res.status(401).json({ code: 401, message: `存储节点接口鉴权失败: ${auth.reason}` })
  })

  // ── Static media hotlink protection (only when whitelist configured) ──
  app.use('/uploads', (req, res, next) => {
    if (config.allowedOrigins.length === 0) {
      console.warn('[Storage Node ⚠️] ALLOWED_ORIGINS 未配置，静态媒体当前允许任意来源访问（建议配置 C 端/后台域名）')
      return next()
    }
    const originHost = originHostOf(req)
    if (!originHost) return next() // no Origin/Referer → allow (mobile WebView / privacy / direct link)
    if (config.allowedOrigins.includes(originHost)) return next()
    return res.status(403).json({ code: 403, message: '来源域名不在白名单，拒绝访问媒体资源' })
  })
  app.use('/uploads', express.static(path.resolve(dirs.publicDir, 'uploads')))

  // ── Multer instances ──
  const uploadSingle = createSingleUpload({ videosDir: dirs.videosDir })
  const uploadChunk = createChunkUpload({ tempChunksDir: dirs.tempChunksDir })

  // ── GET /api/v1/storage/status ──
  app.get('/api/v1/storage/status', (_req, res) => {
    let videoCount = 0
    let posterCount = 0
    try { videoCount = fs.readdirSync(dirs.videosDir).length } catch { /* ignore */ }
    try { posterCount = fs.readdirSync(dirs.postersDir).length } catch { /* ignore */ }
    res.json({
      code: 200,
      message: 'success',
      data: {
        nodeId: config.nodeId,
        nodeName: config.nodeName,
        status: 'ONLINE',
        port: config.port,
        videoCount,
        posterCount,
        uptimeSeconds: Math.floor(process.uptime()),
        baseUrl: `http://localhost:${config.port}`,
        // 能力协商：主控 upload-ticket 据此下发 capability（老节点无此字段 = 按默认处理）
        capability: {
          chunk: true,
          chunkSize: CHUNK_SIZE,
          maxSingleSize: 2 * 1024 * 1024 * 1024,
        },
      },
    })
  })

  // ── GET /api/v1/storage/debug ──
  app.get('/api/v1/storage/debug', (req, res) => {
    let videoCount = 0
    let posterCount = 0
    let tempChunkCount = 0
    try { videoCount = fs.readdirSync(dirs.videosDir).length } catch { /* ignore */ }
    try { posterCount = fs.readdirSync(dirs.postersDir).length } catch { /* ignore */ }
    try { tempChunkCount = fs.readdirSync(dirs.tempChunksDir).length } catch { /* ignore */ }
    res.json({
      code: 200,
      message: 'Storage Node Debug Diagnostic Report',
      data: {
        nodeId: config.nodeId,
        nodeName: config.nodeName,
        port: config.port,
        publicUrl: config.publicUrl || 'Not set',
        mainServerUrl: config.mainServerUrl || 'Not set',
        hasClusterSecret: !!config.clusterSecret,
        isDebugMode: config.isDebug,
        stats: {
          videoCount,
          posterCount,
          tempChunkDirs: tempChunkCount,
          uptimeSeconds: Math.floor(process.uptime()),
          memoryUsage: process.memoryUsage(),
        },
        clientInfo: {
          ip: req.ip || req.socket?.remoteAddress,
          headers: req.headers,
        },
      },
    })
  })

  // ── POST /api/v1/storage/upload (full single file) ──
  // POST /api/v1/storage/cleanup - 孤儿文件清理（上传未提交/视频已删除 = 死档）
  // body: { referenced: string[] } - 主服务器下发的被引用相对路径（videos/xxx.mp4, posters/yyy.jpg）
  // 规则: 未引用 + 超过 24h 的文件删除；temp_chunks 超时全清（未 merge 必是孤儿）
  app.post('/api/v1/storage/cleanup', (req, res) => {
    const ORPHAN_AGE_MS = 24 * 3600 * 1000
    const referenced = new Set(Array.isArray(req.body?.referenced) ? req.body.referenced : [])
    const cutoff = Date.now() - ORPHAN_AGE_MS
    const removed = []

    const sweep = (dir, prefix) => {
      let files = []
      try { files = fs.readdirSync(dir) } catch { return }
      for (const name of files) {
        const p = path.join(dir, name)
        let st
        try { st = fs.statSync(p) } catch { continue }
        if (st.isFile() && st.mtimeMs < cutoff && !referenced.has(prefix + name)) {
          try { fs.unlinkSync(p); removed.push(prefix + name) } catch { /* ignore */ }
        }
      }
    }

    sweep(dirs.videosDir, 'videos/')
    sweep(dirs.postersDir, 'posters/')
    sweep(dirs.tempChunksDir, 'temp_chunks/')

    if (removed.length) {
      console.log(`[Storage Node] Cleanup removed ${removed.length} orphan files: ${removed.slice(0, 5).join(', ')}...`)
    }
    res.json({ code: 200, message: 'cleanup done', data: { removed, count: removed.length } })
  })

  // POST /api/v1/storage/delete - 删除单个已上传文件（任务取消时主服务器调用）
  // body: { path: "videos/xxx.mp4" }（相对 uploads 根）
  app.post('/api/v1/storage/delete', (req, res) => {
    const rel = String(req.body?.path || '').trim()
    // 路径穿越防护：只允许 videos/posters 前缀，不允许 ..
    if (!rel || !/^[a-z_]+\/[^./][^.]*$/.test(rel) || rel.includes('..')) {
      return res.status(400).json({ code: 400, message: 'invalid path' })
    }
    const safe = path.resolve(path.join(dirs.publicDir, 'uploads', rel))
    const base = path.resolve(path.join(dirs.publicDir, 'uploads'))
    if (!safe.startsWith(base + path.sep)) {
      return res.status(400).json({ code: 400, message: 'invalid path' })
    }
    try {
      if (fs.existsSync(safe) && fs.statSync(safe).isFile()) {
        fs.unlinkSync(safe)
        console.log(`[Storage Node] Deleted file: ${rel}`)
        return res.json({ code: 200, data: { path: rel } })
      }
      return res.status(404).json({ code: 404, message: 'file not found' })
    } catch (e) {
      return res.status(500).json({ code: 500, message: e.message })
    }
  })

  app.post('/api/v1/storage/upload', uploadSingle.single('video'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: 'Missing video file parameter (field: video)' })
    }
    const file = req.file
    const videoPath = file.path
    const publicVideoPath = `/uploads/videos/${file.filename}`
    const publicPosterPath = await generateFrame50Poster(videoPath, dirs.postersDir)

    const baseUrl = resolvePublicBaseUrl(config, req)
    res.json({
      code: 200,
      message: 'Upload to storage node successful',
      data: {
        nodeId: config.nodeId,
        filename: file.filename,
        sizeBytes: file.size,
        videoPath: publicVideoPath,
        posterPath: publicPosterPath,
        videoUrl: mediaUrl(baseUrl, publicVideoPath),
        posterUrl: mediaUrl(baseUrl, publicPosterPath),
      },
    })
  })

  // ── GET /api/v1/storage/check-chunks (self-healing resume) ──
  app.get('/api/v1/storage/check-chunks', (req, res) => {
    const uploadId = sanitizeUploadId(req.query.uploadId)
    if (!uploadId) {
      return res.status(400).json({ code: 400, message: 'Missing or invalid uploadId parameter' })
    }

    const fileSize = Number(req.query.fileSize) || 0
    const totalChunks = Number(req.query.totalChunks) || 0
    const chunkDir = path.join(dirs.tempChunksDir, uploadId)
    const existingChunks = []

    if (fs.existsSync(chunkDir)) {
      try {
        const files = fs.readdirSync(chunkDir)
        files.forEach((file) => {
          if (!file.startsWith('chunk_')) return
          const index = parseInt(file.replace('chunk_', ''), 10)
          if (Number.isNaN(index) || index < 0) return

          const chunkPath = path.join(chunkDir, file)
          try {
            const stat = fs.statSync(chunkPath)
            if (stat.size <= 0) {
              fs.rmSync(chunkPath, { force: true })
              return
            }
            if (fileSize > 0 && totalChunks > 0 && index < totalChunks) {
              const expected = Math.min(CHUNK_SIZE, fileSize - index * CHUNK_SIZE)
              if (stat.size !== expected) {
                fs.rmSync(chunkPath, { force: true })
                return
              }
            }
            existingChunks.push(index)
          } catch {
            /* ignore race */
          }
        })
      } catch {
        /* ignore */
      }
    }

    res.json({
      code: 200,
      message: 'Uploaded chunks query successful',
      data: { uploadId, uploadedChunks: existingChunks },
    })
  })

  // ── POST /api/v1/storage/upload-chunk ──
  app.post('/api/v1/storage/upload-chunk', uploadChunk.single('chunk'), (req, res) => {
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
      data: { uploadId, chunkIndex: idx },
    })
  })

  // ── POST /api/v1/storage/merge-chunks (stream merge + idempotency + size integrity) ──
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

    // Idempotency: already merged → return stored result. Record lives in persistent merge_records dir.
    const recordPath = path.join(dirs.mergeRecordsDir, `merge_result_${safeId}.json`)
    if (fs.existsSync(recordPath)) {
      try {
        const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
        if (record && record.filename && fs.existsSync(path.join(dirs.videosDir, record.filename))) {
          console.log(`[Storage Node 📦] Merge idempotent hit for ${safeId}, returning stored result`)
          return res.json({ code: 200, message: '分片拼接已完成（幂等命中）', data: record })
        }
      } catch {
        /* ignore corrupt record */
      }
    }

    const chunkDir = path.join(dirs.tempChunksDir, safeId)
    if (!fs.existsSync(chunkDir)) {
      return res.status(404).json({ code: 404, message: '未找到分片文件临时目录' })
    }

    const fileSizeNum = Number(fileSize) || 0

    // Pre-validate ALL chunks before touching final file (never leave a half-written video).
    const invalidChunks = findInvalidChunks({ chunkDir, total, fileSize: fileSizeNum })
    if (invalidChunks.length > 0) {
      return res.status(400).json({
        code: 400,
        message: `分片校验失败，缺失或损坏分片: ${invalidChunks.join(', ')}，请重新上传这些分片后再试`,
      })
    }

    const ext = path.extname(filename || 'video.mp4') || '.mp4'
    const hash = crypto.createHash('md5').update((filename || 'vid') + Date.now()).digest('hex').substring(0, 10)
    const finalFilename = `vid_${Date.now()}_${hash}${ext}`
    const finalVideoPath = path.join(dirs.videosDir, finalFilename)
    const chunkPaths = Array.from({ length: total }, (_, i) => path.join(chunkDir, `chunk_${i}`))

    try {
      const finalSize = await mergeChunksToFile({
        chunkPaths,
        finalVideoPath,
        expectedFinalSize: fileSizeNum,
      })

      const publicVideoPath = `/uploads/videos/${finalFilename}`
      const publicPosterPath = await generateFrame50Poster(finalVideoPath, dirs.postersDir)
      const baseUrl = resolvePublicBaseUrl(config, req)

      const record = {
        nodeId: config.nodeId,
        filename: finalFilename,
        sizeBytes: finalSize,
        videoPath: publicVideoPath,
        posterPath: publicPosterPath,
        videoUrl: mediaUrl(baseUrl, publicVideoPath),
        posterUrl: mediaUrl(baseUrl, publicPosterPath),
      }

      // Persist idempotency record BEFORE deleting chunks (crash-safe), then cleanup temp.
      try {
        persistMergeRecord({ recordPath, record })
      } catch (e) {
        console.error(`[Storage Node 📦] Failed to persist merge record for ${safeId}:`, e.message)
      }
      try {
        fs.rmSync(chunkDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }

      console.log(`[Storage Node 📦] Parallel chunks merged successfully: ${finalFilename} (${(finalSize / 1024 / 1024).toFixed(2)} MB)`)
      return res.json({ code: 200, message: '多分片并发传输与缝合完成！', data: record })
    } catch (err) {
      console.error(`[Storage Node 📦] Chunk merge error for ${safeId}:`, err.message)
      if (err && err.sizeMismatch) {
        return res.status(400).json({ code: 400, message: err.message })
      }
      return res.status(500).json({ code: 500, message: `分片合并处理失败: ${err.message}` })
    }
  })

  // ── Final error handler (JSON 400/500 instead of HTML error pages) ──
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const reason = err.code === 'LIMIT_FILE_SIZE' ? `文件大小超过限制 (${err.field || 'unknown'})` : err.message
      return res.status(400).json({ code: 400, message: `上传参数/文件校验失败: ${reason}` })
    }
    // Multer destination-callback rejections (e.g. bad uploadId) surface as plain Errors.
    if (err && err.message && /非法|拒绝|invalid|must be/i.test(err.message)) {
      return res.status(400).json({ code: 400, message: `上传被拒绝: ${err.message}` })
    }
    // Genuine system errors (disk full, EACCES, ...) should be 500, not 400.
    console.error('[Storage Node ❌] Unhandled server error:', err)
    return res.status(500).json({ code: 500, message: `服务器内部错误: ${err?.message || 'unknown'}` })
  })

  return app
}
