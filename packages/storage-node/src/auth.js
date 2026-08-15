import crypto from 'node:crypto'

/**
 * HMAC-SHA256 cluster ticket signing + verification.
 *
 * 两套契约，方向不同：
 * 1) 节点入站（主控 → 节点）：verifyClusterTicketSignature 校验，签名串 = JSON.stringify({ nodeId, timestamp })
 *    —— 主控 createClusterSignedHeaders 生成（含 scope 化直传凭证分支）
 * 2) 节点出站（节点 → 主控）：主控 verifyClusterHmacSignature 校验，签名串 = JSON.stringify(完整请求体)
 *    —— 本文件 createHmacSignedHeaders 生成（register / heartbeat 等）
 * 注意：两套契约的 payloadStr 不同，切勿混用（曾因统一成 {nodeId,timestamp} 导致心跳/注册 401 静默失败）。
 */

/**
 * Build auth headers signed with the cluster secret（节点 → 主控方向）。
 * 签名串 = 完整请求体（与主控 verifyClusterHmacSignature 的 JSON.stringify(req.body) 一致）。
 * @param {object|string} payload - 完整请求体（stringified inside）
 * @param {string} secret
 * @returns {{'Content-Type':string, 'X-Cluster-Timestamp':string, 'X-Cluster-Nonce':string, 'X-Cluster-Signature':string}}
 */
export const createHmacSignedHeaders = (payload, secret) => {
  const timestamp = Date.now().toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  // 契约与主控 verifyClusterHmacSignature 一致：bodyString = JSON.stringify(完整请求体)，
  // timestamp 取 header 时间（sign/verify 都用请求头里的值）
  const bodyString = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${bodyString}.${timestamp}.${nonce}`)
    .digest('hex')

  return {
    'Content-Type': 'application/json',
    'X-Cluster-Timestamp': timestamp,
    'X-Cluster-Nonce': nonce,
    'X-Cluster-Signature': signature,
  }
}

/**
 * Resolve origin/referer string to a normalized origin host ('https://domain.com').
 * Returns '' when absent or unparseable.
 * @param {import('express').Request} req
 */
export const originHostOf = (req) => {
  const origin = req.get('origin') || req.get('referer') || ''
  try {
    return origin ? new URL(origin).origin : ''
  } catch {
    return ''
  }
}

/**
 * Verify a storage-node API request.
 * Order: 1) HMAC ticket signature (支持 scope 化直传凭证)  2) TOKEN mode  3) source-origin whitelist.
 *
 * scope 化凭证（浏览器直传用）：主控签发时把 uploadId 作为 scope 纳入签名串，
 * 存储节点校验：签名必须匹配带 scope 的串，且路径限定在直传接口、uploadId 必须等于 scope。
 * 这样浏览器拿到的凭证无法重放到 delete/cleanup/status 之外的管理接口。
 *
 * @param {import('express').Request} req
 * @param {{secret:string, nodeId:string, allowedOrigins:string[], windowMs:number}} ctx
 * @returns {{valid:boolean, reason?:string, mode?:string}}
 */
export const verifyClusterTicketSignature = (req, ctx) => {
  const { secret, nodeId, allowedOrigins, windowMs } = ctx

  const timestamp = req.get('X-Cluster-Timestamp')
  const nonce = req.get('X-Cluster-Nonce')
  const signature = req.get('X-Cluster-Signature')
  const scope = req.get('X-Cluster-Scope') || ''

  if (timestamp && nonce && signature) {
    const now = Date.now()
    const reqTime = Number(timestamp)
    if (Number.isNaN(reqTime) || Math.abs(now - reqTime) > windowMs) {
      return { valid: false, reason: '签名已过期（超过 12 小时）' }
    }
    const payloadStr = JSON.stringify(scope ? { nodeId, timestamp, scope } : { nodeId, timestamp })
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${payloadStr}.${timestamp}.${nonce}`)
      .digest('hex')
    if (signature !== expectedSig) {
      return { valid: false, reason: 'HMAC 签名不匹配' }
    }

    // scope 存在 = 浏览器直传凭证：限定路径 + 绑定 uploadId
    if (scope) {
      const bound = verifyScopeBinding(req, scope)
      if (!bound.ok) {
        return { valid: false, reason: bound.reason }
      }
    }
    return { valid: true, mode: 'HMAC-SHA256' }
  }

  // TOKEN mode fallback
  const reqSecret =
    req.get('X-Cluster-Token') ||
    req.body?.clusterSecret ||
    (req.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (reqSecret && reqSecret === secret) {
    return { valid: true, mode: 'TOKEN' }
  }

  // Source-origin whitelist fallback
  const originHost = originHostOf(req)
  if (originHost && allowedOrigins.includes(originHost)) {
    return { valid: true, mode: 'ORIGIN' }
  }

  return { valid: false, reason: '缺少有效签名/密钥，且来源域名不在白名单' }
}

/**
 * scope 凭证路径/uploadId 绑定校验：
 * - 只允许直传链路接口（upload / upload-chunk / check-chunks / merge-chunks / status）
 * - upload-chunk / check-chunks / merge-chunks 请求中的 uploadId 必须等于 scope
 * @returns {{ok:boolean, reason?:string}}
 */
const verifyScopeBinding = (req, scope) => {
  // 注意：鉴权中间件挂载在 /api/v1/storage 下，req.path 已被剥离前缀（如 /status），
  // 必须用 originalUrl（完整路径）做白名单匹配
  const path = (req.originalUrl || req.url || '').split('?')[0]
  const SCOPED_ALLOWED = [
    '/api/v1/storage/upload',
    '/api/v1/storage/upload-chunk',
    '/api/v1/storage/check-chunks',
    '/api/v1/storage/merge-chunks',
    '/api/v1/storage/status',
  ]
  if (!SCOPED_ALLOWED.includes(path)) {
    return { ok: false, reason: `scope 凭证禁止访问 ${path}` }
  }
  // 携带 uploadId 的接口必须与 scope 一致（单文件直传/status 无 uploadId，跳过）
  if (path !== '/api/v1/storage/upload' && path !== '/api/v1/storage/status') {
    const uploadId = req.body?.uploadId ?? req.query?.uploadId
    if (String(uploadId || '') !== scope) {
      return { ok: false, reason: 'uploadId 与凭证 scope 不匹配' }
    }
  }
  return { ok: true }
}
