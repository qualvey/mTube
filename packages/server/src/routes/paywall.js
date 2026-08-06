import { Router } from 'express'
import { db } from '../db.js'
import { logger } from '../logger.js'
import { config } from '../config.js'
import { sendResponse } from '../utils/response.js'
import * as paywallService from '../services/paywallService.js'
import { verifyAlipayNotifySign } from '../integrations/alipay.js'

const router = Router()

// 套餐配置
router.get('/config', (req, res) => {
  const plans = db.getPlans(req.query.lang)
  sendResponse(res, { plans })
})

// 创建本地订单（兼容旧接口）
router.post('/order', (req, res) => {
  const order = db.createOrder(req.body)
  sendResponse(res, order)
})

// 订单状态查询（前端支付完成后轮询）
router.get('/order/:id', (req, res) => {
  const order = db.getOrderById(req.params.id)
  if (!order) return sendResponse(res, null, 404, '订单不存在')
  sendResponse(res, {
    ...order,
    payStatus: order.status === 'PAID' ? 'PAID' : (order.status || 'PENDING'),
  })
})

// VIP 设备状态查询
router.get('/vip-status', (req, res) => {
  const { deviceId } = req.query
  const vipInfo = db.getDeviceVip(deviceId)
  sendResponse(res, vipInfo)
})

// 取消 / 撤销设备 VIP
router.all(['/vip/cancel', '/vip-cancel'], (req, res) => {
  const deviceId = req.params.deviceId || req.body?.deviceId || req.query?.deviceId
  if (!deviceId) {
    return sendResponse(res, null, 400, '缺失 deviceId 参数')
  }
  const cleanId = String(deviceId).trim()
  db.revokeDeviceVip(cleanId)
  sendResponse(res, { success: true, deviceId: cleanId }, 200, '设备 VIP 权限已成功取消')
})

// 创建支付订单（ruyizf 优先，未配置时回退支付宝）
router.post('/alipay/create', async (req, res) => {
  const { planId, deviceId } = req.body
  if (!planId) {
    return sendResponse(res, null, 400, '缺失 planId 参数')
  }
  try {
    const result = await paywallService.createPayment({ planId, deviceId, ip: req.ip })
    sendResponse(res, result)
  } catch (e) {
    logger.error('[Paywall] create payment failed:', e.message)
    sendResponse(res, null, 500, e.message)
  }
})

// ruyizf 支付回调（异步通知，验签后激活 VIP）
router.post('/notify', (req, res) => {
  const result = paywallService.handleRuyizfNotify(req)
  res.send(result === 'SUCCESS' ? 'SUCCESS' : 'FAIL')
})

// ruyizf 订单状态（主动查询兜底）
router.get('/ruyizf/query/:id', async (req, res) => {
  try {
    const resp = await paywallService.queryRuyizfOrder(req.params.id)
    sendResponse(res, resp)
  } catch (e) {
    logger.error('[Paywall] ruyizf query failed:', e.message)
    sendResponse(res, null, 500, e.message)
  }
})

// 支付宝回调（保留原逻辑）
router.post('/alipay/notify', (req, res) => {
  const params = req.body
  const settings = db.getSettings()

  const isValid = verifyAlipayNotifySign(params, settings.alipayPublicKey)
  if (!isValid) {
    logger.warn('Alipay notify signature verification failed')
    return res.status(400).send('fail')
  }

  const orderId = params.out_trade_no
  const tradeNo = params.trade_no
  const totalAmount = Number(params.total_amount)
  const tradeStatus = params.trade_status

  if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
    const order = db.getOrderById(orderId)
    if (order && Math.abs(order.amount - totalAmount) < 0.01) {
      db.completeOrder(orderId, tradeNo)
      logger.info(`Alipay order completed successfully: ${orderId}, tradeNo: ${tradeNo}`)
      return res.send('success')
    }
  }

  res.send('fail')
})

// 加密货币 USDT 下单（保留原逻辑）
router.post('/crypto/create', (req, res) => {
  const { planId, deviceId } = req.body
  const settings = db.getSettings()
  const rate = Number(settings.cryptoExchangeRate) || 7.2

  const plans = db.getPlans()
  const plan = plans.find(p => p.id === planId || p.key === planId) || plans[0]
  const cnyAmount = plan ? plan.price : 39
  const baseCryptoAmount = Number((cnyAmount / rate).toFixed(2))

  const existingOrders = db.getOrders().filter(o => o.payType === 'crypto_usdt' && o.status === 'PENDING')
  const usedAmounts = new Set(existingOrders.map(o => Number(o.cryptoAmount || 0).toFixed(4)))

  let offset = 0
  let finalCryptoAmount = baseCryptoAmount
  while (usedAmounts.has(finalCryptoAmount.toFixed(4))) {
    offset += 0.0001
    finalCryptoAmount = Number((baseCryptoAmount + offset).toFixed(4))
  }

  const usdtAddress = settings.cryptoUsdtAddress || 'TY7x9N2m8Qk4Pz1v6W3s5R7u9Y2X4B6C8V'

  const order = db.createOrder({
    planId: plan ? plan.id : planId,
    deviceId,
    payType: 'crypto_usdt',
    status: 'PENDING',
    cryptoAddress: usdtAddress,
    cryptoAmount: finalCryptoAmount
  })

  sendResponse(res, {
    orderId: order.id,
    usdtAddress,
    cryptoAmount: finalCryptoAmount,
    baseCryptoAmount,
    cnyAmount,
    network: 'TRC-20 (TRON)',
    createdAt: order.createdAt
  })
})

// 使用订单号恢复 VIP
router.post('/restore', (req, res) => {
  const { orderId, deviceId } = req.body
  if (!orderId || !deviceId) {
    return sendResponse(res, null, 400, '订单号和设备标识不能为空')
  }

  const result = db.restoreVipByOrder(orderId.trim(), deviceId.trim())
  if (result.success) {
    sendResponse(res, result, 200, result.message)
  } else {
    sendResponse(res, null, 400, result.message)
  }
})

export default router
