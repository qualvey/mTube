import crypto from 'node:crypto'

/**
 * Ruyizf (如意支付) merchant API client.
 * Contract (pay-API.md):
 *  - POST /pay   代收下单
 *  - POST /amount  代付余额
 *  - POST /query   统一查单
 *  - Sign = MD5( non-empty params sorted by ASCII as k=v&k=v... &secret=*** ) uppercase
 *  - `sign` and `extend` do NOT participate in signing
 */

export function ruyizfSign(params, secret) {
  const keys = Object.keys(params)
    .filter(k => params[k] !== null && params[k] !== undefined && params[k] !== '')
    .sort()
  const str = keys.map(k => `${k}=${params[k]}`).join('&') + `&secret=***`
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase()
}

export function createRuyizfClient({ apiUrl, mch, secret }) {
  async function post(path, params) {
    const sign = ruyizfSign(params, secret)
    const res = await fetch(apiUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, sign }),
    })
    return res.json()
  }

  return {
    /**
     * 代收下单
     * @param {object} o { orderId, price(分), notify, callback?, clientIP, code? }
     * @returns {Promise<{code, message, data?: {url, expireTime, sdk}}>}
     */
    async createPayOrder({ orderId, price, notify, callback, clientIP, code }) {
      return post('/pay', {
        mch,
        code: code || '4444',
        orderid: orderId,
        price,
        notify,
        callback,
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
