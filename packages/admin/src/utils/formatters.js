export const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export const formatSpeed = (bytesPerSec) => {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s'
  if (bytesPerSec >= 1024 * 1024) {
    return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s'
  }
  return (bytesPerSec / 1024).toFixed(0) + ' KB/s'
}

export const buildHeadersJson = (referer, userAgent) => {
  const obj = {}
  if (referer && referer.trim()) {
    obj['Referer'] = referer.trim()
  }
  if (userAgent && userAgent.trim()) {
    obj['User-Agent'] = userAgent.trim()
  }
  if (Object.keys(obj).length === 0) {
    return null
  }
  return JSON.stringify(obj, null, 2)
}
