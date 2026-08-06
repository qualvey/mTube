import crypto from 'node:crypto'

// Helper function to build Alipay WAP Payment URL using Node's native RSA2 crypto
export function generateAlipayWapUrl({ appId, privateKey, notifyUrl, orderId, amount, subject }) {
  if (!appId || !privateKey) {
    return `https://openapi.alipay.com/gateway.do?mock_order_id=${orderId}&amount=${amount}`
  }

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const bizContent = JSON.stringify({
    out_trade_no: orderId,
    total_amount: Number(amount).toFixed(2),
    subject: subject || 'VIP 订阅服务',
    product_code: 'QUICK_WAP_WAY'
  })

  const params = {
    app_id: appId,
    method: 'alipay.trade.wap.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp,
    version: '1.0',
    notify_url: notifyUrl,
    biz_content: bizContent
  }

  const sortedKeys = Object.keys(params).sort()
  const signContent = sortedKeys.map(k => `${k}=${params[k]}`).join('&')

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signContent, 'utf8')
  const formattedKey = privateKey.includes('-----BEGIN')
    ? privateKey
    : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`

  const sign = signer.sign(formattedKey, 'base64')
  const queryStr = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')

  return `https://openapi.alipay.com/gateway.do?${queryStr}&sign=${encodeURIComponent(sign)}`
}

// Verify Alipay Notify Callback RSA2 Signature
export function verifyAlipayNotifySign(params, alipayPublicKey) {
  if (!alipayPublicKey) return true
  const { sign, sign_type, ...rest } = params
  if (!sign) return false

  const sortedKeys = Object.keys(rest).sort()
  const signContent = sortedKeys.map(k => `${k}=${rest[k]}`).join('&')

  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(signContent, 'utf8')

  const formattedPubKey = alipayPublicKey.includes('-----BEGIN')
    ? alipayPublicKey
    : `-----BEGIN PUBLIC KEY-----\n${alipayPublicKey}\n-----END PUBLIC KEY-----`

  return verifier.verify(formattedPubKey, sign, 'base64')
}
