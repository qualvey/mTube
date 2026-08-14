// 内存滑动窗口限流（单实例够用；多实例部署时换 Redis）
const buckets = new Map()
const MAX_BUCKETS = 20000

export const ipKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown'

/**
 * 滑动窗口限流
 * @param {object} opts { windowMs, max, keyFn, message }
 */
export const rateLimit = (opts) => {
  const { windowMs = 60000, max = 10, keyFn = ipKey, message = '请求过于频繁，请稍后再试' } = opts
  return (req, res, next) => {
    const key = keyFn(req)
    const now = Date.now()
    let arr = buckets.get(key)
    if (!arr) {
      if (buckets.size >= MAX_BUCKETS) buckets.clear() // 防内存膨胀
      arr = []
      buckets.set(key, arr)
    }
    while (arr.length && arr[0] <= now - windowMs) arr.shift()
    if (arr.length >= max) {
      return res.status(429).json({ code: 429, message })
    }
    arr.push(now)
    next()
  }
}
