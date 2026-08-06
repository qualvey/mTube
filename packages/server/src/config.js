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
    mch: process.env.RUIZIF_MCH || '***REMOVED***',
    secret: process.env.RUIZIF_SECRET || '',          // empty = ruyizf disabled
    channel: process.env.RUIZIF_CHANNEL || '4444',    // 数字人民币通道
    notifyUrl: process.env.RUIZIF_NOTIFY_URL || '',   // e.g. https://91sco.com/api/v1/paywall/notify
    notifyIps: (process.env.RUIZIF_NOTIFY_IPS || '***REMOVED***')
      .split(',').map(s => s.trim()).filter(Boolean), // callback source IP allowlist
  },

  // Alipay (existing mock/real) settings are read from db settings
}
