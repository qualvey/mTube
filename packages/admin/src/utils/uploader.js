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

export const uploadFileParallelChunks = (ticket, file, stateRefs = {}) => {
  const { uploadProgress, uploadSpeed, uploadDetailText, uploadStatusLabel } = stateRefs
  const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks
  const CONCURRENCY_LIMIT = 4 // 4 parallel TCP sockets
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  const chunkLoadedBytes = new Array(totalChunks).fill(0)
  let lastTime = Date.now()
  let lastTotalLoaded = 0

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
      if (uploadDetailText) uploadDetailText.value = `${formatBytes(totalLoaded)} / ${formatBytes(file.size)} (4并发通道)`

      lastTotalLoaded = totalLoaded
      lastTime = now
    }
  }

  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i)
  let activeWorkers = 0
  let hasError = false

  return new Promise((resolve, reject) => {
    const processNextChunk = () => {
      if (hasError) return
      if (chunkIndices.length === 0 && activeWorkers === 0) {
        if (uploadStatusLabel) {
          uploadStatusLabel.value = `⚡ [4并发直传] 分片完结，正在自动拼接文件并提取第50帧封面...`
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

        xhr.onload = () => {
          activeWorkers--
          if (xhr.status === 413) {
            hasError = true
            reject(new Error('HTTP 413 请求体超出限制: Nginx 限制了分片上传大小，请在 VPS Nginx 增加 client_max_body_size 2000M; 配置'))
            return
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            chunkLoadedBytes[chunkIndex] = end - start
            updateOverallProgress()
            processNextChunk()
          } else {
            hasError = true
            reject(new Error(`分片 ${chunkIndex} 传输失败 HTTP ${xhr.status}`))
          }
        }

        xhr.onerror = () => {
          activeWorkers--
          hasError = true
          reject(new Error(`分片 ${chunkIndex} 网络错误`))
        }

        xhr.send(formData)
      }
    }

    processNextChunk()
  })
}
