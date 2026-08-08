// ==============================================================================
// GeoIP 国家码解析（地理画像用）
// 隐私原则：默认原始 IP 只用于即时解析，不落库；入库的只有 ISO 国家码。
// 如需原始 IP 落库（对账/反作弊/地域可追溯），设置环境变量 ANALYTICS_STORE_RAW_IP=true。
// 当前实现：ip-api.com 在线查询 + 内存缓存（免费档 45 req/min，缓存命中后无压力）。
// 生产建议：换成 MaxMind GeoLite2 本地 mmdb 库（离线、无限量、低延迟）。
// ==============================================================================

const cache = new Map() // ip -> { code, at }
const inflight = new Map() // ip -> Promise（同 IP 并发去重）
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_CACHE_SIZE = 20_000

const isPrivateIp = (ip) => {
  if (!ip) return true
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true
  return ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.') || ip.startsWith('172.31.') || ip.startsWith('169.254.')
}

const setCache = (ip, code) => {
  cache.set(ip, { code, at: Date.now() })
  if (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
}

const queryGeo = async (ip) => {
  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,country`,
      { signal: AbortSignal.timeout(2500) }
    )
    const info = await response.json()
    const code = info && info.status === 'success' ? String(info.countryCode || '').toUpperCase() : ''
    setCache(ip, code)
    return code
  } catch {
    setCache(ip, '')
    return ''
  }
}

/**
 * 解析 IP 对应的 ISO 国家码（如 US / CN / HK），解析失败返回 ''（不阻塞事件入库）。
 * @param {string} ip 原始客户端 IP
 * @returns {Promise<string>}
 */
export const getCountryCode = (ip) => {
  if (!ip) return Promise.resolve('')
  const clean = String(ip).replace(/^::ffff:/, '').trim()
  if (isPrivateIp(clean)) return Promise.resolve('')

  const cached = cache.get(clean)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.code)

  if (inflight.has(clean)) return inflight.get(clean)
  const promise = queryGeo(clean).finally(() => inflight.delete(clean))
  inflight.set(clean, promise)
  return promise
}

/** 测试/调试用：直接看缓存状态 */
export const getGeoCacheSize = () => cache.size
