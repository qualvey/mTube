import fs from 'node:fs'
import { createHmacSignedHeaders } from './auth.js'

/**
 * Safely format target API URL (supports https://domain.com, https://domain.com/api, http://IP:3000).
 * @param {string} baseUrl
 * @param {string} endpointPath e.g. 'storage-nodes/register'
 * @returns {string}
 */
export const buildApiUrl = (baseUrl, endpointPath) => {
  let cleanBase = baseUrl.replace(/\/$/, '')
  cleanBase = cleanBase.replace(/\/api\/v1$/, '').replace(/\/api$/, '')
  return `${cleanBase}/api/v1/${endpointPath.replace(/^\//, '')}`
}

/**
 * Compute the absolute base URL for media served by this node.
 * Prefers PUBLIC_URL unless it looks localhost; otherwise derives from the request host/protocol.
 * @param {{publicUrl:string, port:number}} cfg
 * @param {import('express').Request} req
 */
export const resolvePublicBaseUrl = (cfg, req) => {
  const hostHeader = req.get('host') || `localhost:${cfg.port}`
  const protocol = req.protocol || 'http'
  if (cfg.publicUrl && !cfg.publicUrl.includes('localhost')) {
    return cfg.publicUrl.replace(/\/$/, '')
  }
  return `${protocol}://${hostHeader}`
}

/** Build a full public media URL from a path like '/uploads/videos/x.mp4'. */
export const mediaUrl = (baseUrl, mediaPath) => (mediaPath ? `${baseUrl}${mediaPath}` : '')

/**
 * Auto-register with the main control server on startup (HMAC signed).
 * @param {{mainServerUrl:string, nodeId:string, nodeName:string, publicUrl:string, isDefault:boolean, secret:string}} cfg
 */
export const registerWithMainServer = async (cfg) => {
  const { mainServerUrl, nodeId, nodeName, publicUrl, isDefault, secret } = cfg
  if (!mainServerUrl) return

  try {
    const targetUrl = buildApiUrl(mainServerUrl, 'storage-nodes/register')
    console.log(`[Storage Node 📦] Auto-registering (HMAC-SHA256 Signed) to Main Control Server: ${targetUrl}`)

    const payload = {
      id: nodeId,
      name: nodeName,
      baseUrl: publicUrl,
      isDefault,
    }

    const headers = createHmacSignedHeaders(payload, secret)

    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const text = await resp.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* non-json */
    }

    if (resp.ok && json && json.code === 200) {
      console.log(`[Storage Node 📦] ✅ Auto-registered successfully with Main Control Server! Response: ${json.message}`)
    } else if (resp.status === 404) {
      console.warn(
        `[Storage Node 📦] Auto-registration returned HTTP 404: 主站服务器尚未更新部署最新的 auto-register 路由，请触发主站 CI/CD 升级。`
      )
    } else {
      console.warn(`[Storage Node 📦] Auto-registration returned status ${resp.status}:`, json ? json.message || json : text.substring(0, 150))
    }
  } catch (err) {
    console.warn(`[Storage Node 📦] Auto-registration connection failed to ${mainServerUrl}:`, err.message)
  }
}

/**
 * Send a periodic heartbeat to the main control server.
 * @param {{mainServerUrl:string, nodeId:string, secret:string, videosDir:string}} cfg
 */
export const sendHeartbeat = async (cfg) => {
  const { mainServerUrl, nodeId, secret, videosDir } = cfg
  if (!mainServerUrl) return

  let videoCount = 0
  try {
    videoCount = fs.readdirSync(videosDir).length
  } catch {
    /* ignore */
  }

  try {
    const targetUrl = buildApiUrl(mainServerUrl, 'storage-nodes/heartbeat')
    const payload = { id: nodeId, status: 'ONLINE', videoCount }
    const headers = createHmacSignedHeaders(payload, secret)
    await fetch(targetUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
  } catch {
    // Silent fail on heartbeat retry
  }
}
