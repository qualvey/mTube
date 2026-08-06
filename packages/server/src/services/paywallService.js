import { db } from '../db.js'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { createRuyizfClient } from '../integrations/ruyizf.js'
import { generateAlipayWapUrl } from '../integrations/alipay.js'

// Ruyizf client — only active when RUIZIF_SECRET is configured
export const ruyizf = config.ruyizf.secret
  ? createRuyizfClient({ apiUrl: config.ruyizf.apiUrl, mch: config.ruyizf.mch, secret: config.ruyizf.secret })
  : null

export const isRuyizfEnabled = () => Boolean(ruyizf)

/**
 * Create a payment order.
 * Priority: ruyizf (如意支付) when configured → alipay wap (mock or real) fallback.
 * @returns {Promise<{orderId, payUrl, amount, payType, expireTime?}>}
 */
export async function createPayment({ planId, deviceId, ip }) {
  const plans = db.getPlans()
  const plan = plans.find(p => p.id === planId || p.key === planId) || plans[0]
  const order = db.createOrder({
    planId: plan ? plan.id : planId,
    deviceId,
    payType: ruyizf ? 'ruyizf' : 'alipay',
    status: 'PENDING'
  })

  if (!ruyizf) {
    // Fallback: alipay wap (mock URL when keys not configured)
    const settings = db.getSettings()
    const payUrl = generateAlipayWapUrl({
      appId: settings.alipayAppId,
      privateKey: settings.alipayPrivateKey,
      notifyUrl: settings.alipayNotifyUrl || 'http://localhost:3000/api/v1/paywall/alipay/notify',
      orderId: order.id,
      amount: order.amount,
      subject: order.planName
    })
    return { orderId: order.id, payUrl, amount: order.amount, payType: 'alipay' }
  }

  // Ruyizf 代收下单
  const notifyUrl = config.ruyizf.notifyUrl
  if (!notifyUrl) {
    throw new Error('支付回调地址未配置（RUIZIF_NOTIFY_URL），无法下单')
  }
  const resp = await ruyizf.createPayOrder({
    orderId: order.id,
    price: Math.round(order.amount * 100),        // 元 → 分
    notify: notifyUrl,
    // 注意: 不传 callback —— 平台对 callback 参数验签不匹配（传了必 54），已实测确认
    clientIP: config.ruyizf.clientIp,   // 固定服务器公网 IP（不能用 req.ip，反代/本机场景平台会拒）
    code: config.ruyizf.channel,
  })
  if (resp.code !== 0 || !resp.data || !resp.data.url) {
    logger.error('[Ruyizf] createPayOrder failed:', JSON.stringify(resp))
    throw new Error(`支付平台下单失败: ${resp.message || resp.code}`)
  }
  return {
    orderId: order.id,
    payUrl: resp.data.url,
    amount: order.amount,
    payType: 'ruyizf',
    expireTime: resp.data.expireTime,
  }
}

/**
 * Handle ruyizf async notify (支付回调).
 * Returns 'SUCCESS' | 'FAIL' (plain text per contract).
 */
export function handleRuyizfNotify(req) {
  const params = req.body || {}

  // Optional source-IP allowlist hardening
  const ip = req.ip
  if (config.ruyizf.notifyIps.length && !config.ruyizf.notifyIps.includes(ip)) {
    logger.warn(`[Ruyizf] notify from unexpected IP ${ip}, ignored`)
    return 'FAIL'
  }
  if (!ruyizf || !ruyizf.verifyNotifySign(params)) {
    logger.warn('[Ruyizf] notify signature verification failed')
    return 'FAIL'
  }

  const { orderid, status, price } = params
  // 代收只处理 status=1 (支付成功)
  if (Number(status) === 1) {
    const order = db.getOrderById(orderid)
    if (order) {
      if (order.status === 'PAID') {
        // Idempotent: already processed
        return 'SUCCESS'
      }
      if (Math.abs(order.amount * 100 - Number(price)) < 1) {
        db.completeOrder(orderid, params.payTime || null)
        logger.info(`[Ruyizf] order paid & VIP granted: ${orderid}`)
      } else {
        logger.warn(`[Ruyizf] amount mismatch for ${orderid}: order=${order.amount}, paid=${price}`)
      }
    } else {
      logger.warn(`[Ruyizf] notify for unknown order: ${orderid}`)
    }
  }
  return 'SUCCESS'
}

/** Fallback: query order status from ruyizf (用于回调丢失时的兜底核对) */
export async function queryRuyizfOrder(orderId) {
  if (!ruyizf) return null
  const resp = await ruyizf.queryOrder(orderId)
  return resp
}
