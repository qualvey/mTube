import crypto from 'node:crypto'

/**
 * HMAC-SHA256 cluster ticket signing + verification.
 * Shared contract with main server's createClusterSignedHeaders():
 *   payloadStr = JSON.stringify({ nodeId, timestamp })
 *   signature   = HMAC-SHA256( secret, `${payloadStr}.${timestamp}.${nonce}` )
 */

/**
 * Build auth headers signed with the cluster secret.
 * @param {object|string} payload - request body payload (stringified inside)
 * @param {string} secret
 * @returns {{'Content-Type':string, 'X-Cluster-Timestamp':string, 'X-Cluster-Nonce':string, 'X-Cluster-Signature':string}}
 */
export const createHmacSignedHeaders = (payload, secret) => {
  const timestamp = Date.now().toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  // 契约与 verifyClusterTicketSignature 一致：payloadStr = JSON.stringify({ nodeId, timestamp })
  // （timestamp 统一取 header 时间，忽略调用方 payload 里的 timestamp，避免 sign/verify 不一致）
  const nodeId = (typeof payload === 'object' && payload && payload.nodeId) || ''
  const bodyString = JSON.stringify({ nodeId, timestamp })
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
 * Order: 1) HMAC ticket signature  2) TOKEN mode  3) source-origin whitelist.
 * @param {import('express').Request} req
 * @param {{secret:string, nodeId:string, allowedOrigins:string[], windowMs:number}} ctx
 * @returns {{valid:boolean, reason?:string, mode?:string}}
 */
export const verifyClusterTicketSignature = (req, ctx) => {
  const { secret, nodeId, allowedOrigins, windowMs } = ctx

  const timestamp = req.get('X-Cluster-Timestamp')
  const nonce = req.get('X-Cluster-Nonce')
  const signature = req.get('X-Cluster-Signature')

  if (timestamp && nonce && signature) {
    const now = Date.now()
    const reqTime = Number(timestamp)
    if (Number.isNaN(reqTime) || Math.abs(now - reqTime) > windowMs) {
      return { valid: false, reason: '签名已过期（超过 12 小时）' }
    }
    const payloadStr = JSON.stringify({ nodeId, timestamp })
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${payloadStr}.${timestamp}.${nonce}`)
      .digest('hex')
    if (signature !== expectedSig) {
      return { valid: false, reason: 'HMAC 签名不匹配' }
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
