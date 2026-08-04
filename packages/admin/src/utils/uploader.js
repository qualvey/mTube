import { formatBytes, formatSpeed } from './formatters.js'

export const uploadFileWithProgress = (url, formData, headers = {}, stateRefs = {}) => {
  const { uploadProgress, uploadSpeed, uploadDetailText, uploadStatusLabel } = stateRefs

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)

    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key])
    })

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
          const loadedDiff = e.loaded - lastLoaded
          const bytesPerSec = timeDiff > 0 ? loadedDiff / timeDiff : 0
          if (uploadSpeed) uploadSpeed.value = formatSpeed(bytesPerSec)
          if (uploadDetailText) uploadDetailText.value = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`

          lastLoaded = e.loaded
          lastTime = now
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status === 413) {
        if (url.includes('/admin/videos/upload')) {
          reject(new Error('HTTP 413 请求体超出限制: 【中转模式】已触发 Cloudflare CDN 免费版 100MB 单次 POST 传输上限！请确保在后台启用【4通道切片直传模式】以绕过 100MB 限制。'))
        } else {
          reject(new Error('HTTP 413 请求体超出限制: VPS Nginx 限制了文件上传大小，请在 VPS Nginx 增加 client_max_body_size 2000M; 配置'))
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
        reject(new Error(`HTTP ${xhr.status} 响应解析异常: ${xhr.responseText.substring(0, 100)}`))
      }
    }

    xhr.onerror = () => reject(new Error('网络请求异常或服务器连接被阻断'))
    xhr.ontimeout = () => reject(new Error('上传请求超时'))
    xhr.send(formData)
  })
}

export const uploadFileParallelChunks = async (ticket, file, stateRefs = {}, options = {}) => {
  const { uploadProgress, uploadSpeed, uploadDetailText, uploadStatusLabel } = stateRefs
  const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks
  const CONCURRENCY_LIMIT = Number(options.concurrency) || 4 // Configurable parallel TCP sockets (default 4)
  const MAX_RETRIES = 3 // Max retries per chunk on network fluctuation
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  // Calculate deterministic uploadId for resumable upload matching
  const sanitizeName = file.name.replace(/[^a-zA-Z0-9_\.-]/g, '_')
  const fileHashInput = `${sanitizeName}_${file.size}_${file.lastModified}`
  let uploadId = 'up_'
  for (let i = 0; i < fileHashInput.length; i++) {
    uploadId += fileHashInput.charCodeAt(i).toString(16)
  }
  uploadId = uploadId.substring(0, 48)

  const chunkLoadedBytes = new Array(totalChunks).fill(0)
  const chunkRetries = new Array(totalChunks).fill(0)
  let lastTime = Date.now()
  let lastTotalLoaded = 0

  // 1. Resumable Upload Check: Probe storage node for existing chunks
  let existingChunkIndices = new Set()
  try {
    if (uploadStatusLabel) uploadStatusLabel.value = '⚡ [断点检查] 正在探测存储节点已有分片历史...'
    const cleanBase = (ticket.baseUrl || '').replace(/\/$/, '')
    const checkRes = await fetch(`${cleanBase}/api/v1/storage/check-chunks?uploadId=${uploadId}`, {
      headers: ticket.headers || {}
    })
    if (checkRes.ok) {
      const checkJson = await checkRes.json()
      if (checkJson.data && Array.isArray(checkJson.data.uploadedChunks)) {
        existingChunkIndices = new Set(checkJson.data.uploadedChunks)
        if (existingChunkIndices.size > 0 && uploadStatusLabel) {
          uploadStatusLabel.value = `⚡ [断点续传] 已命中历史进度！直接恢复 ${existingChunkIndices.size}/${totalChunks} 个已有分片`
        }
      }
    }
  } catch (e) {
    console.warn('[Resumable Check] Could not check existing chunks:', e.message)
  }

  // Mark already existing chunks as 100% completed
  for (let i = 0; i < totalChunks; i++) {
    if (existingChunkIndices.has(i)) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, file.size)
      chunkLoadedBytes[i] = end - start
    }
  }

  const updateOverallProgress = () => {
    const totalLoaded = chunkLoadedBytes.reduce((sum, b) => sum + b, 0)
    const percent = Math.floor((totalLoaded / file.size) * 100)
    if (uploadProgress) uploadProgress.value = Math.min(percent, 99)

    const now = Date.now()
    const timeDiff = (now - lastTime) / 1000

    if (timeDiff >= 0.3 || totalLoaded === file.size) {
      const loadedDiff = totalLoaded - lastTotalLoaded
      const bytesPerSec = timeDiff > 0 ? loadedDiff / timeDiff : 0
      if (uploadSpeed) uploadSpeed.value = formatSpeed(bytesPerSec)
      if (uploadDetailText) {
        const detailSuffix = existingChunkIndices.size > 0 ? ` (${CONCURRENCY_LIMIT}通道 / 断点恢复)` : ` (${CONCURRENCY_LIMIT}并发通道)`
        uploadDetailText.value = `${formatBytes(totalLoaded)} / ${formatBytes(file.size)}${detailSuffix}`
      }

      lastTotalLoaded = totalLoaded
      lastTime = now
    }
  }

  // Initial progress calculation in case existing chunks are restored
  updateOverallProgress()

  // Prepare remaining uncompleted chunk queue
  const chunkIndices = []
  for (let i = 0; i < totalChunks; i++) {
    if (!existingChunkIndices.has(i)) {
      chunkIndices.push(i)
    }
  }

  let activeWorkers = 0
  let hasError = false

  return new Promise((resolve, reject) => {
    const processNextChunk = () => {
      if (hasError) return
      if (chunkIndices.length === 0 && activeWorkers === 0) {
        if (uploadStatusLabel) {
          uploadStatusLabel.value = `⚡ [${CONCURRENCY_LIMIT}并发直传] 所有分片就位，存储节点正在自动缝合文件与提取第50帧封面...`
        }
        fetch(ticket.mergeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(ticket.headers || {})
          },
          body: JSON.stringify({
            uploadId,
            filename: file.name,
            totalChunks
          })
        })
          .then(r => r.json())
          .then(mergeJson => {
            if (mergeJson.code === 200 && mergeJson.data) {
              if (uploadProgress) uploadProgress.value = 100
              resolve({ ok: true, status: 200, data: mergeJson })
            } else {
              reject(new Error(mergeJson.message || '分片拼接失败'))
            }
          })
          .catch(err => reject(new Error('分片缝合请求失败: ' + err.message)))
        return
      }

      while (activeWorkers < CONCURRENCY_LIMIT && chunkIndices.length > 0) {
        const chunkIndex = chunkIndices.shift()
        activeWorkers++

        const sendChunkXHR = () => {
          const start = chunkIndex * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE, file.size)
          const chunkBlob = file.slice(start, end)

          const formData = new FormData()
          formData.append('uploadId', uploadId)
          formData.append('chunkIndex', chunkIndex.toString())
          formData.append('totalChunks', totalChunks.toString())
          formData.append('chunk', chunkBlob, `chunk_${chunkIndex}`)

          const xhr = new XMLHttpRequest()
          xhr.open('POST', ticket.chunkUploadUrl, true)
          Object.keys(ticket.headers || {}).forEach(k => xhr.setRequestHeader(k, ticket.headers[k]))

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              chunkLoadedBytes[chunkIndex] = e.loaded
              updateOverallProgress()
            }
          }

          const handleChunkFailure = (errorMsg) => {
            if (chunkRetries[chunkIndex] < MAX_RETRIES) {
              chunkRetries[chunkIndex]++
              console.warn(`[Chunk Upload Retry] Retry ${chunkRetries[chunkIndex]}/${MAX_RETRIES} for chunk_${chunkIndex}: ${errorMsg}`)
              if (uploadStatusLabel) {
                uploadStatusLabel.value = `⚡ [抖动重试] 分片 ${chunkIndex + 1}/${totalChunks} 正在自动进行第 ${chunkRetries[chunkIndex]}/${MAX_RETRIES} 次重试...`
              }
              setTimeout(() => {
                sendChunkXHR()
              }, 1000 * chunkRetries[chunkIndex])
            } else {
              activeWorkers--
              hasError = true
              reject(new Error(`分片 ${chunkIndex + 1} 重试 ${MAX_RETRIES} 次均失败: ${errorMsg}`))
            }
          }

          xhr.onload = () => {
            if (xhr.status === 413) {
              activeWorkers--
              hasError = true
              reject(new Error('HTTP 413 请求体超出限制: Nginx 限制了分片上传大小，请在 VPS Nginx 增加 client_max_body_size 2000M; 配置'))
              return
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              activeWorkers--
              chunkLoadedBytes[chunkIndex] = end - start
              updateOverallProgress()
              processNextChunk()
            } else {
              handleChunkFailure(`HTTP ${xhr.status}`)
            }
          }

          xhr.onerror = () => handleChunkFailure('网络断开或请求阻断')
          xhr.ontimeout = () => handleChunkFailure('请求超时')
          xhr.send(formData)
        }

        sendChunkXHR()
      }
    }

    processNextChunk()
  })
}
