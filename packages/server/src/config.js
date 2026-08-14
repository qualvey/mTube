import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Centralized environment configuration
export const config = {
  port: Number(process.env.PORT) || 3000,

  uploadsDir: path.resolve(__dirname, '../public/uploads'),
  postersDir: path.resolve(__dirname, '../public/uploads/posters'),

  // Cluster node HMAC secret (shared with storage-node)
  clusterSecret: process.env.CLUSTER_SECRET || 'streamvip-cluster-secret',

  // Ruyizf (如意支付) merchant config — all overridable via env
  ruyizf: {
    apiUrl: process.env.RUIZIF_API_URL || 'https://api.TCXCY.ruyizf.xyz',
    mch: process.env.RUIZIF_MCH || '',                    // 商户号（必须配置；空 = ruyizf 支付不可用）
    secret: process.env.RUIZIF_SECRET || '',          // empty = ruyizf disabled
    channel: process.env.RUIZIF_CHANNEL || '4444',    // 数字人民币通道
    notifyUrl: process.env.RUIZIF_NOTIFY_URL || '',   // e.g. https://91sco.com/api/v1/paywall/notify
    notifyIps: (process.env.RUIZIF_NOTIFY_IPS || '')
      .split(',').map(s => s.trim()).filter(Boolean), // callback source IP allowlist
    // 下单 clientIP 参数：必须用服务器公网 IP（平台校验，反代的 req.ip 不可靠）
    clientIp: process.env.RUIZIF_CLIENT_IP || '',
  },

  // Alipay (existing mock/real) settings are read from db settings

  // 注册邮箱验证（开关）：默认开启；关闭 = 注册即登录（不验证邮箱）
  emailVerificationEnabled: process.env.EMAIL_VERIFICATION_ENABLED !== 'false',

  // Resend 邮件服务（注册验证码）；未配 key 时进入开发模式（验证码随响应返回 devCode）
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.RESEND_FROM || 'onboarding@resend.dev',
  },

  // Analytics (统计/地域分析) — all overridable via env
  analytics: {
    // 分析采集总开关。false = 拒绝所有 events/batch 上报（默认开）
    enabled: process.env.ANALYTICS_ENABLED !== 'false',
    // 原始 IP 落库开关。true = analytics_events 表额外存原始 clientIp（默认关，隐私优先）
    // 注意：即使关闭，ipHash（加盐哈希）与 GeoIP 国家码仍正常采集
    storeRawIp: process.env.ANALYTICS_STORE_RAW_IP === 'true',
    // GeoIP 国家码解析开关。false = 不调用外部 GeoIP 服务，countryCode 恒为空（默认开）
    geoipEnabled: process.env.ANALYTICS_GEOIP_ENABLED !== 'false',
  },
}
