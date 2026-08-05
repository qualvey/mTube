import { formatBytes, formatSpeed } from './formatters.js'

// ==============================================================================
// Build multipart/form-data body as a pre-allocated ArrayBuffer.
// Key advantage: browser sends `Content-Length` instead of `Transfer-Encoding: chunked`,
// allowing the TCP stack to advertise the full payload size upfront.
// This eliminates the TCP slow-start penalty from chunked encoding —
// the kernel can pipeline the entire 5MB chunk without waiting for ACKs
// between MIME boundary segments, matching curl's raw throughput behavior.
// ==============================================================================
const buildMultipartBody = async (fields, fileBlob, filename) => {
  const boundary = `HystBnd${Date.now()}${Math.random().toString(36).substring(2, 10)}`
  const enc = new TextEncoder()

  let preamble = ''
  for (const [name, value] of Object.entries(fields)) {
    preamble += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  }
  preamble += `--${boundary}\r\nContent-Disposition: form-data; name="chunk"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`

  const preambleBytes = enc.encode(preamble)
  const epilogueBytes = enc.encode(`\r\n--${boundary}--\r\n`)
  const fileBytes = await fileBlob.arrayBuffer()

  const totalLen = preambleBytes.length + fileBytes.byteLength + epilogueBytes.length
  const merged = new Uint8Array(totalLen)
  merged.set(preambleBytes)
  merged.set(new Uint8Array(fileBytes), preambleBytes.length)
  merged.set(epilogueBytes, preambleBytes.length + fileBytes.byteLength)

  return {
    body: merged.buffer,
    contentType: `multipart/form-data; boundary=${boundary}`
  }
}

// ==============================================================================
// TCP Connection Pre-Warming (Hysteria2-style)
// Fire N parallel lightweight requests to establish N keep-alive TCP connections
// before the actual upload begins. By the time the first chunk is sent,
// the OS TCP window is already past slow-start initial period, enabling
// full-speed delivery from the very first chunk.
// ==============================================================================
const warmConnections = async (baseUrl, count, headers = {}) => {
  const cleanBase = baseUrl.replace(/\/$/, '')
  const probes = Array.from({ length: count }, () =>
    fetch(`${cleanBase}/api/v1/storage/status`, { headers }).catch(() => null)
  )
  await Promise.all(probes)
}

// ==============================================================================
// Proxy Upload (中转模式): XHR with onprogress — used only as fallback
// ==============================================================================
export const uploadFileWithProgress = (url, formData, headers = {}, stateRefs = {}) => {
  const { uploadProgress, uploadSpeed, uploadDetailText, uploadStatusLabel } = stateRefs

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)

    Object.keys(headers).forEach(key => xhr.setRequestHeader(key, headers[key]))

    let lastLoaded = 0
    let lastTime = Date.now()

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.floor((e.loaded / e.total) * 100)
        if (uploadProgress) uploadProgress.value = percent

        if (percent >= 100 && uploadStatusLabel) {
          uploadStatusLabel.value = '📦 [中转模式] 浏览器文件已发送完毕，主控正在向存储节点二次传输与生成封面...'
        }

        const now = Date.now()
        const timeDiff = (now - lastTime) / 1000

        if (timeDiff >= 0.3 || e.loaded === e.total) {
          const bytesDiff = e.loaded - lastLoaded
          const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0
          if (uploadSpeed) uploadSpeed.value = formatSpeed(speed)
          if (uploadDetailText) uploadDetailText.value = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`

          lastLoaded = e.loaded
          lastTime = now
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status === 413) {
        if (url.includes('/admin/videos/upload')) {
          reject(new Error('HTTP 413: 【中转模式】已触发 Cloudflare 免费版 100MB 单次 POST 上限！请启用【切片直传模式】绕过 100MB 限制。'))
        } else {
          reject(new Error('HTTP 413: VPS Nginx 限制文件大小，请设置 client_max_body_size 2000M'))
        }
        return
      }
      try {
        const json = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true, status: xhr.status, data: json })
        } else {
          resolve({ ok: false, status: xhr.status, data: json })
        }
      } catch (err) {
        reject(new Error(`HTTP ${xhr.status} 响应解析失败: ${xhr.responseText.substring(0, 100)}`))
      }
    }

    xhr.onerror = () => reject(new Error('网络连接中断'))
    xhr.ontimeout = () => reject(new Error('上传超时'))
    xhr.send(formData)
  })
}

// ==============================================================================
// Hysteria2-style Aggressive Parallel Chunk Upload Engine
//
// Performance model:
//  Phase 1 — TCP Pre-Warm:    Establish N keep-alive TCP connections
//  Phase 2 — Resumable Check: Skip already-uploaded chunks (断点续传)
//  Phase 3 — Brute Upload:    N concurrent fetch() with ArrayBuffer bodies
//                              → Content-Length header (no chunked encoding)
//                              → TCP window grows continuously across chunks
//                              → No TLS re-handshake between sequential chunks
//  Phase 4 — Merge + Poster:  POST /storage/merge-chunks → FFmpeg frame50
// ==============================================================================
export const uploadFileParallelChunks = async (ticket, file, stateRefs = {}, options = {}) => {
  const { uploadProgress, uploadSpeed, uploadDetailText, uploadStatusLabel } = stateRefs
  const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB per chunk
  // Clamp to the 2-8 channel range enforced by the admin settings UI
  const CONCURRENCY = Math.min(8, Math.max(2, Number(options.concurrency) || 4))
  const MAX_RETRIES = 3
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  // Deterministic uploadId — stable across page reloads for resumable upload
  const safeName = file.name.replace(/[^a-zA-Z0-9_\.-]/g, '_')
  let uploadId = 'up_'
  const seed = `${safeName}_${file.size}_${file.lastModified}`
  for (let i = 0; i < seed.length && uploadId.length < 48; i++) {
    uploadId += seed.charCodeAt(i).toString(16)
  }

  const cleanBase = (ticket.baseUrl || '').replace(/\/$/, '')

  // ── Phase 1: TCP Pre-Warming ──────────────────────────────────────────────
  if (uploadStatusLabel) {
    uploadStatusLabel.value = `⚡ [TCP预热] 正在建立 ${CONCURRENCY} 条独立高速通道 (Hysteria2 模式)...`
  }
  await warmConnections(cleanBase, CONCURRENCY, ticket.headers || {})

  // ── Phase 2: Resumable Upload Check ──────────────────────────────────────
  let resumedChunks = new Set()
  try {
    if (uploadStatusLabel) uploadStatusLabel.value = '⚡ [断点检测] 探测存储节点历史分片...'
    // Pass fileSize/totalChunks so the node can size-validate resumed chunks
    // (0-byte or partial chunks from a crashed session are discarded → self-healing resume)
    const checkRes = await fetch(`${cleanBase}/api/v1/storage/check-chunks?uploadId=${uploadId}&fileSize=${file.size}&totalChunks=${totalChunks}`, {
      headers: ticket.headers || {}
    })
    if (checkRes.ok) {
      const cj = await checkRes.json()
      if (cj.data && Array.isArray(cj.data.uploadedChunks)) {
        resumedChunks = new Set(cj.data.uploadedChunks)
        if (resumedChunks.size > 0 && uploadStatusLabel) {
          uploadStatusLabel.value = `⚡ [断点续传] 命中 ${resumedChunks.size}/${totalChunks} 个历史分片，直接恢复！`
        }
      }
    }
  } catch (e) {
    console.warn('[Resumable] check-chunks error:', e.message)
  }

  // ── Progress Tracking ─────────────────────────────────────────────────────
  const chunkDoneBytes = new Array(totalChunks).fill(0)
  for (let i = 0; i < totalChunks; i++) {
    if (resumedChunks.has(i)) {
      chunkDoneBytes[i] = Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE)
    }
  }

  // sessionBaseBytes: bytes already done before this session (from resumable restore)
  // Speed is measured only against NEW bytes uploaded in this session
  const sessionBaseBytes = chunkDoneBytes.reduce((a, b) => a + b, 0)
  let lastReportTime = Date.now()
  let lastReportedBytes = sessionBaseBytes

  const reportProgress = (forceUpdate = false) => {
    const totalDone = chunkDoneBytes.reduce((a, b) => a + b, 0)
    const pct = Math.floor((totalDone / file.size) * 100)
    if (uploadProgress) uploadProgress.value = Math.min(pct, 99)

    const now = Date.now()
    const elapsed = (now - lastReportTime) / 1000
    if (forceUpdate || elapsed >= 0.4) {
      // Only count bytes uploaded in THIS session for speed display
      const newBytesThisInterval = totalDone - lastReportedBytes
      const speed = elapsed > 0 ? newBytesThisInterval / elapsed : 0

      if (uploadSpeed) {
        if (speed > 0) {
          uploadSpeed.value = formatSpeed(speed)
        } else if (forceUpdate && resumedChunks.size > 0) {
          uploadSpeed.value = '⏸ 恢复中'
        }
      }

      if (uploadDetailText) {
        const tag = resumedChunks.size > 0 ? `${CONCURRENCY}通道+断点恢复` : `${CONCURRENCY}通道暴力直传`
        uploadDetailText.value = `${formatBytes(totalDone)} / ${formatBytes(file.size)} (${tag})`
      }

      if (!forceUpdate) {
        lastReportTime = now
        lastReportedBytes = totalDone
      }
    }
  }

  // ── Phase 3: Build Pending Chunk Queue ────────────────────────────────────
  const queue = []
  for (let i = 0; i < totalChunks; i++) {
    if (!resumedChunks.has(i)) queue.push(i)
  }

  let active = 0
  let failed = false

  return new Promise((resolve, reject) => {
    const next = () => {
      if (failed) return

      // All chunks complete → Phase 4: merge
      if (queue.length === 0 && active === 0) {
        if (uploadStatusLabel) {
          uploadStatusLabel.value = `⚡ [缝合中] ${CONCURRENCY}通道传输完毕，存储节点缝合文件并提取第50帧封面...`
        }

        const mergePayload = { uploadId, filename: file.name, totalChunks, fileSize: file.size }

        const callMerge = () => fetch(ticket.mergeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(ticket.headers || {}) },
          body: JSON.stringify(mergePayload),
          // 10 min: includes FFmpeg frame-50 poster extraction on the storage node
          signal: AbortSignal.timeout(600000)
        }).then(r => r.json())

        // Merge is idempotent on the storage node (merge_result_<uploadId> record):
        // if the first attempt actually succeeded server-side but the response was lost
        // (timeout/network blip), the retry returns the stored result instead of re-uploading.
        const attemptMerge = async (attempt) => {
          try {
            const mj = await callMerge()
            if (mj.code === 200 && mj.data) {
              if (uploadProgress) uploadProgress.value = 100
              resolve({ ok: true, status: 200, data: mj })
              return
            }
            throw new Error(mj.message || '分片拼接失败')
          } catch (err) {
            if (attempt < 2) {
              console.warn(`[MergeRetry] merge attempt ${attempt}/2 failed (${err.message}), retrying...`)
              if (uploadStatusLabel) {
                uploadStatusLabel.value = `⚡ [缝合重试] 第 ${attempt + 1}/2 次...`
              }
              await new Promise(r => setTimeout(r, 2000))
              return attemptMerge(attempt + 1)
            }
            reject(new Error('merge-chunks 请求失败: ' + err.message))
          }
        }
        attemptMerge(1)
        return
      }

      // Fill up to CONCURRENCY concurrent workers
      while (active < CONCURRENCY && queue.length > 0) {
        const chunkIndex = queue.shift()
        active++

        const sendChunk = async (retry = 0) => {
          const start = chunkIndex * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE, file.size)

          try {
            // Build ArrayBuffer multipart body → forces Content-Length header
            const { body, contentType } = await buildMultipartBody(
              {
                uploadId,
                chunkIndex: String(chunkIndex),
                totalChunks: String(totalChunks)
              },
              file.slice(start, end),
              `chunk_${chunkIndex}`
            )

            const resp = await fetch(ticket.chunkUploadUrl, {
              method: 'POST',
              headers: { 'Content-Type': contentType, ...(ticket.headers || {}) },
              body // ArrayBuffer → browser sends Content-Length, TCP window grows freely
            })

            if (resp.status === 413) {
              active--
              failed = true
              reject(new Error('HTTP 413: Nginx client_max_body_size 太小，请设置 2000M'))
              return
            }

            if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)

            // ✅ Chunk uploaded successfully
            chunkDoneBytes[chunkIndex] = end - start
            active--
            reportProgress(false)
            next()
          } catch (err) {
            if (retry < MAX_RETRIES) {
              const delay = 800 * Math.pow(2, retry) // 800ms, 1.6s, 3.2s
              console.warn(`[ChunkRetry] chunk_${chunkIndex} → retry ${retry + 1}/${MAX_RETRIES} in ${delay}ms (${err.message})`)
              if (uploadStatusLabel) {
                uploadStatusLabel.value = `⚡ [网络抖动] 分片 ${chunkIndex + 1}/${totalChunks} 第 ${retry + 1}/${MAX_RETRIES} 次重试...`
              }
              await new Promise(r => setTimeout(r, delay))
              await sendChunk(retry + 1)
            } else {
              active--
              failed = true
              reject(new Error(`分片 ${chunkIndex + 1} 重试 ${MAX_RETRIES} 次均失败: ${err.message}`))
            }
          }
        }

        sendChunk()
      }
    }

    reportProgress(true) // Force initial render with correct byte count
    next()
  })
}
