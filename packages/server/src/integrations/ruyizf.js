import crypto from 'node:crypto'

/**
 * Ruyizf (如意支付) merchant API client.
 * Contract (pay-API.md):
 *  - POST /pay   代收下单
 *  - POST /amount  代付余额
 *  - POST /query   统一查单
 *  - Sign = MD5( non-empty params sorted by ASCII as k=v&k=v... &secret=*** ) uppercase
 *  - `sign` and `extend` do NOT participate in signing
 *
 * 请求方式: node 原生 fetch (全局 fetch)。实测成功 —— 平台接受 node 客户端。
 */

export function ruyizfSign(params, secret) {
  const keys = Object.keys(params)
    .filter(k => params[k] !== null && params[k] !== undefined && params[k] !== '')
    .sort()
  const str = keys.map(k => `${k}=${params[k]}`).join('&') + '&secret=' + secret
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase()
}

export function createRuyizfClient({ apiUrl, mch, secret }) {
  // debug 模式: RUIZIF_DEBUG=true 时打印每次 POST 的完整请求参数与响应
  const debug = process.env.RUIZIF_DEBUG === 'true' || process.env.RUIZIF_DEBUG === '1'

  function debugLog(label, obj) {
    if (debug) console.log(`[Ruyizf Debug] ${label}: ${JSON.stringify(obj)}`)
  }

  async function post(path, params) {
    const sign = ruyizfSign(params, secret)
    const payload = { ...params, sign }
    const body = JSON.stringify(payload)

    // 完整请求参数（secret 仅脱敏显示前4+后4位）
    const logPayload = { ...payload, secret: secret.slice(0, 4) + '***' + secret.slice(-4) }
    debugLog(`POST ${apiUrl}${path} 请求参数`, logPayload)

    let resp
    try {
      const res = await fetch(apiUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${res.statusText}`)
      }
      resp = await res.json()
    } catch (e) {
      debugLog(`POST ${apiUrl}${path} request 执行失败`, { message: e.message })
      throw e
    }

    debugLog(`POST ${apiUrl}${path} 响应`, resp)
    return resp
  }

  return {
    /**
     * 代收下单
     * @param {object} o { orderId, price(分), notify, clientIP, code? }
     * @returns {Promise<{code, message, data?: {url, expireTime, sdk}}>}
     */
    async createPayOrder({ orderId, price, notify, clientIP, code }) {
      return post('/pay', {
        mch,
        code: code || '4444',
        orderid: orderId,
        price,
        notify,
        // 注意: 不传 callback —— 平台对 callback 参数验签不匹配（传了必 54），已实测确认
        reqTime: Date.now(),
        clientIP,
      })
    },

    /** 统一查单 */
    async queryOrder(orderId) {
      return post('/query', { mch, orderid: orderId, reqTime: Date.now() })
    },

    /** 代收/代付余额 */
    async getBalance() {
      return post('/amount', { mch, reqTime: Date.now() })
    },

    /** 回调验签（merchant/price/orderid/payTime/status + sign） */
    verifyNotifySign(params) {
      const { sign, ...rest } = params || {}
      if (!sign) return false
      const expect = ruyizfSign(rest, secret)
      return expect === String(sign).toUpperCase()
    },
  }
}
