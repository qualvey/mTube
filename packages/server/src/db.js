import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}
const DB_SQLITE_PATH = path.join(dataDir, 'db.sqlite')
const DB_JSON_PATH = path.join(dataDir, 'db.json')

// Initialize SQLite database instance

const database = new DatabaseSync(DB_SQLITE_PATH)

// Initialize Tables
database.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    author TEXT DEFAULT '官方创作者',
    authorAvatar TEXT DEFAULT '',
    videoUrl TEXT NOT NULL,
    poster TEXT DEFAULT '',
    duration TEXT DEFAULT '05:00',
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    isVip INTEGER DEFAULT 0,
    status TEXT DEFAULT 'PUBLISHED',
    tags TEXT DEFAULT '[]',
    headers TEXT DEFAULT NULL,
    previewDuration INTEGER DEFAULT 120,
    createdAt TEXT NOT NULL
  );
`)

try {
  database.exec("ALTER TABLE videos ADD COLUMN previewDuration INTEGER DEFAULT 120;")
} catch (e) {
  // Column already exists
}

database.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL,
    originalPrice REAL NOT NULL,
    badgeText TEXT DEFAULT NULL,
    isHot INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    planId TEXT DEFAULT NULL,
    planName TEXT NOT NULL,
    amount REAL NOT NULL,
    payType TEXT NOT NULL,
    status TEXT DEFAULT 'PAID',
    deviceId TEXT DEFAULT NULL,
    restoredCount INTEGER DEFAULT 0,
    tradeNo TEXT DEFAULT NULL,
    cryptoAddress TEXT DEFAULT NULL,
    cryptoAmount REAL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vip_devices (
    deviceId TEXT PRIMARY KEY,
    vipExpireAt TEXT NOT NULL,
    lastOrderId TEXT DEFAULT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    location TEXT DEFAULT '未知位置',
    userAgent TEXT DEFAULT '',
    referer TEXT DEFAULT '',
    path TEXT DEFAULT '/',
    videoId TEXT DEFAULT NULL,
    action TEXT DEFAULT 'PV',
    deviceId TEXT DEFAULT NULL,
    createdAt TEXT NOT NULL
  );
`)

try { database.exec("ALTER TABLE orders ADD COLUMN deviceId TEXT DEFAULT NULL;"); } catch (e) { }
try { database.exec("ALTER TABLE orders ADD COLUMN restoredCount INTEGER DEFAULT 0;"); } catch (e) { }
try { database.exec("ALTER TABLE orders ADD COLUMN tradeNo TEXT DEFAULT NULL;"); } catch (e) { }
try { database.exec("ALTER TABLE orders ADD COLUMN cryptoAddress TEXT DEFAULT NULL;"); } catch (e) { }
try { database.exec("ALTER TABLE orders ADD COLUMN cryptoAmount REAL DEFAULT 0;"); } catch (e) { }
try { database.exec("ALTER TABLE videos ADD COLUMN views INTEGER DEFAULT 0;"); } catch (e) { }

// Seed default settings if empty
database.prepare(`
  INSERT OR IGNORE INTO settings (key, value) VALUES 
  ('enableSeekPreview', 'true'),
  ('heroImageUrl', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop'),
  ('heroTitle', '极致诱惑'),
  ('heroSubtitle', '滑动探索更多独家无删减内容'),
  ('alipayAppId', ''),
  ('alipayPrivateKey', ''),
  ('alipayPublicKey', ''),
  ('alipayNotifyUrl', 'http://localhost:3000/api/v1/paywall/alipay/notify'),
  ('cryptoUsdtAddress', 'TY7x9N2m8Qk4Pz1v6W3s5R7u9Y2X4B6C8V'),
  ('cryptoExchangeRate', '7.2'),
  ('enableNotice', 'true'),
  ('noticeTitle', '📢 官方重要公告'),
  ('noticeContent', '欢迎来到 StreamVIP 独家流媒体平台！升级尊享 VIP 会员可无限制观看全站无删减 4K 超清原画库！客服在线时间：10:00 - 24:00。')
`).run()


// Seed or Migrate Data if Videos table is empty
const seedDatabaseIfEmpty = () => {
  const checkStmt = database.prepare('SELECT COUNT(*) as count FROM videos')
  const row = checkStmt.get()

  if (row && row.count > 0) {
    console.log('📦 [SQLite Database] Connected and tables loaded successfully.')
    return
  }

  console.log('🌱 [SQLite Database] Empty database detected. Seeding data...')

  let initialData = null

  // 1. Try migrating existing db.json data if present
  if (fs.existsSync(DB_JSON_PATH)) {
    try {
      const raw = fs.readFileSync(DB_JSON_PATH, 'utf-8')
      initialData = JSON.parse(raw)
      console.log('📦 [SQLite Database] Migrated existing db.json data into SQLite.')
    } catch (e) {
      console.warn('⚠️ Migration read failed:', e.message)
    }
  }

  // 2. Fallback to default initial dataset
  const videos = (initialData && initialData.videos && initialData.videos.length > 0)
    ? initialData.videos
    : [
      {
        id: 'vid-101',
        title: '【4K Ultra HD】赛博朋克极光之夜 - 4K 独家帧率体验',
        description: '穿梭于未来的高科技都市，探索极光与霓虹交织的夜空，感受极致震撼的视觉与听觉盛宴。',
        author: 'CyberVision Studio',
        authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop',
        videoUrl: 'https://vjs.zencdn.net/v/oceans.mp4',
        poster: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
        duration: '09:56',
        likes: 24890,
        shares: 854,
        isVip: true,
        status: 'PUBLISHED',
        tags: '["4K画质","赛博朋克","视觉盛宴"]',
        headers: null,
        createdAt: new Date().toISOString()
      }
    ]

  const insertVid = database.prepare(`
    INSERT INTO videos (id, title, description, author, authorAvatar, videoUrl, poster, duration, likes, shares, isVip, status, tags, headers, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const v of videos) {
    insertVid.run(
      v.id,
      v.title,
      v.description || '',
      v.author || '官方创作者',
      v.authorAvatar || '',
      v.videoUrl,
      v.poster || '',
      v.duration || '05:00',
      v.likes || 0,
      v.shares || 0,
      v.isVip ? 1 : 0,
      v.status || 'PUBLISHED',
      typeof v.tags === 'string' ? v.tags : JSON.stringify(v.tags || []),
      v.headers ? (typeof v.headers === 'string' ? v.headers : JSON.stringify(v.headers)) : null,
      v.createdAt || new Date().toISOString()
    )
  }

  const plans = (initialData && initialData.plans && initialData.plans.length > 0)
    ? initialData.plans
    : [
      { id: 'plan-1', key: 'monthly', name: '包月 VIP', description: '每日更新，尽享丝滑', price: 39, originalPrice: 68, badgeText: null, isHot: false },
      { id: 'plan-2', key: 'quarterly', name: '季卡 VIP', description: '超值推荐，最省钱之选', price: 89, originalPrice: 188, badgeText: '限时特惠', isHot: true },
      { id: 'plan-3', key: 'yearly', name: '尊享年卡 VIP', description: '全年无限制自由观影', price: 268, originalPrice: 588, badgeText: null, isHot: false }
    ]

  const insertPlan = database.prepare(`
    INSERT INTO plans (id, key, name, description, price, originalPrice, badgeText, isHot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const p of plans) {
    insertPlan.run(
      p.id,
      p.key,
      p.name,
      p.description || '',
      p.price,
      p.originalPrice,
      p.badgeText || null,
      p.isHot ? 1 : 0
    )
  }

  const orders = (initialData && initialData.orders && initialData.orders.length > 0)
    ? initialData.orders
    : [
      { id: 'ORD-1785434488800', planId: 'plan-2', planName: '季卡 VIP', amount: 89, payType: 'alipay', status: 'PAID', createdAt: '2026-07-30T18:01:28.800Z' }
    ]

  const insertOrder = database.prepare(`
    INSERT INTO orders (id, planId, planName, amount, payType, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  for (const o of orders) {
    insertOrder.run(
      o.id,
      o.planId || null,
      o.planName,
      o.amount,
      o.payType || 'alipay',
      o.status || 'PAID',
      o.createdAt || new Date().toISOString()
    )
  }
}

seedDatabaseIfEmpty()

const parseTags = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return typeof raw === 'string' ? raw.split(',').map(t => t.trim()).filter(Boolean) : []
  }
}

export const getIpLocation = (ip) => {
  if (!ip) return '未知位置'
  const cleanIp = String(ip).replace(/^::ffff:/, '').trim()
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    return '本地开发环境'
  }
  if (cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.16.') || cleanIp.startsWith('172.31.')) {
    return '局域网 / 内网 IP'
  }
  if (cleanIp.startsWith('114.') || cleanIp.startsWith('218.') || cleanIp.startsWith('183.') || cleanIp.startsWith('120.') || cleanIp.startsWith('119.')) {
    return '中国 广东 广州'
  }
  if (cleanIp.startsWith('180.') || cleanIp.startsWith('222.') || cleanIp.startsWith('116.')) {
    return '中国 北京'
  }
  if (cleanIp.startsWith('101.') || cleanIp.startsWith('112.') || cleanIp.startsWith('139.')) {
    return '中国 浙江 杭州'
  }
  if (cleanIp.startsWith('8.') || cleanIp.startsWith('1.1.1.') || cleanIp.startsWith('172.69.')) {
    return '美国 Cloudflare CDN'
  }
  return '中国 (公网 IP)'
}

const formatVideoRow = (row) => {
  if (!row) return null
  return {
    ...row,
    isVip: Boolean(row.isVip),
    views: Number(row.views || 0),
    previewDuration: row.previewDuration !== undefined && row.previewDuration !== null ? Number(row.previewDuration) : 120,
    tags: parseTags(row.tags)
  }
}

export const db = {
  getVideos(options = {}) {
    const filter = typeof options === 'string' ? options : options.filter
    const tag = typeof options === 'object' ? options.tag : null

    let sql = 'SELECT * FROM videos ORDER BY createdAt DESC'
    if (filter === 'vip') {
      sql = 'SELECT * FROM videos WHERE isVip = 1 ORDER BY createdAt DESC'
    } else if (filter === 'free') {
      sql = 'SELECT * FROM videos WHERE isVip = 0 ORDER BY createdAt DESC'
    }
    const rows = database.prepare(sql).all()
    let results = rows.map(formatVideoRow)

    if (tag && tag.trim()) {
      const targetTag = tag.trim().toLowerCase()
      results = results.filter(v => v.tags && v.tags.some(t => String(t).toLowerCase() === targetTag))
    }

    return results
  },

  getVideoById(id) {
    const row = database.prepare('SELECT * FROM videos WHERE id = ?').get(id)
    return formatVideoRow(row)
  },

  addVideo(data) {
    const newId = `vid-${Date.now()}`
    const headersStr = data.headers
      ? (typeof data.headers === 'string' ? data.headers : JSON.stringify(data.headers))
      : null
    const createdAt = new Date().toISOString()

    const previewDuration = data.previewDuration !== undefined && data.previewDuration !== null
      ? Number(data.previewDuration)
      : 120

    const stmt = database.prepare(`
      INSERT INTO videos (id, title, description, author, authorAvatar, videoUrl, poster, duration, likes, shares, isVip, status, tags, headers, previewDuration, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'PUBLISHED', ?, ?, ?, ?)
    `)

    const tagsStr = Array.isArray(data.tags)
      ? JSON.stringify(data.tags)
      : (typeof data.tags === 'string' ? (data.tags.startsWith('[') ? data.tags : JSON.stringify(data.tags.split(',').map(t => t.trim()).filter(Boolean))) : '[]')

    stmt.run(
      newId,
      data.title || '未命名视频',
      data.description || '',
      data.author || '官方创作者',
      data.authorAvatar || '',
      data.videoUrl || 'https://vjs.zencdn.net/v/oceans.mp4',
      data.poster || '',
      data.duration || '05:00',
      data.isVip ? 1 : 0,
      tagsStr,
      headersStr,
      previewDuration,
      createdAt
    )

    return this.getVideoById(newId)
  },

  updateVideo(id, data) {
    const existing = this.getVideoById(id)
    if (!existing) return null

    const updated = { ...existing, ...data }
    const headersStr = updated.headers !== undefined && updated.headers !== null
      ? (typeof updated.headers === 'string' ? updated.headers : JSON.stringify(updated.headers))
      : null

    const previewDuration = updated.previewDuration !== undefined && updated.previewDuration !== null
      ? Number(updated.previewDuration)
      : 120

    const tagsStr = updated.tags !== undefined
      ? (Array.isArray(updated.tags) ? JSON.stringify(updated.tags) : (typeof updated.tags === 'string' ? (updated.tags.startsWith('[') ? updated.tags : JSON.stringify(updated.tags.split(',').map(t => t.trim()).filter(Boolean))) : '[]'))
      : (typeof existing.tags === 'string' ? existing.tags : JSON.stringify(existing.tags || []))

    const stmt = database.prepare(`
      UPDATE videos
      SET title = ?, description = ?, author = ?, authorAvatar = ?, videoUrl = ?, poster = ?, duration = ?, isVip = ?, tags = ?, headers = ?, previewDuration = ?
      WHERE id = ?
    `)

    stmt.run(
      updated.title,
      updated.description || '',
      updated.author || '官方创作者',
      updated.authorAvatar || '',
      updated.videoUrl,
      updated.poster || '',
      updated.duration || '05:00',
      updated.isVip ? 1 : 0,
      tagsStr,
      headersStr,
      previewDuration,
      id
    )

    return this.getVideoById(id)
  },

  getAllTags() {
    const videos = this.getVideos()
    const tagMap = new Map()

    for (const v of videos) {
      if (Array.isArray(v.tags)) {
        for (const tag of v.tags) {
          const trimmed = String(tag).trim()
          if (trimmed) {
            const count = tagMap.get(trimmed) || 0
            tagMap.set(trimmed, count + 1)
          }
        }
      }
    }

    const tags = []
    for (const [name, count] of tagMap.entries()) {
      tags.push({ name, count })
    }
    return tags.sort((a, b) => b.count - a.count)
  },

  deleteVideo(id) {
    const stmt = database.prepare('DELETE FROM videos WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },

  getPlans() {
    const rows = database.prepare('SELECT * FROM plans').all()
    return rows.map(r => ({ ...r, isHot: Boolean(r.isHot) }))
  },

  updatePlans(newPlans) {
    const updateStmt = database.prepare(`
      UPDATE plans
      SET name = ?, description = ?, price = ?, originalPrice = ?, isHot = ?
      WHERE id = ? OR key = ?
    `)

    for (const p of newPlans) {
      updateStmt.run(
        p.name,
        p.description || '',
        p.price,
        p.originalPrice,
        p.isHot ? 1 : 0,
        p.id || '',
        p.key || ''
      )
    }

    return this.getPlans()
  },

  getDeviceVip(deviceId) {
    if (!deviceId) return { isVip: false, vipExpireAt: null }
    const row = database.prepare('SELECT * FROM vip_devices WHERE deviceId = ?').get(deviceId)
    if (!row) return { isVip: false, vipExpireAt: null }
    const now = new Date()
    const expire = new Date(row.vipExpireAt)
    const isVip = expire > now
    return {
      isVip,
      vipExpireAt: row.vipExpireAt
    }
  },

  grantDeviceVip(deviceId, planId = 'month', orderId = null) {
    if (!deviceId) return null
    const existing = this.getDeviceVip(deviceId)
    let startDate = new Date()
    if (existing.isVip && existing.vipExpireAt) {
      startDate = new Date(existing.vipExpireAt)
    }

    let addDays = 30
    const lowerPlan = String(planId).toLowerCase()
    if (lowerPlan.includes('day')) addDays = 1
    else if (lowerPlan.includes('month') || lowerPlan.includes('plan-1')) addDays = 30
    else if (lowerPlan.includes('season') || lowerPlan.includes('plan-2')) addDays = 90
    else if (lowerPlan.includes('year') || lowerPlan.includes('plan-3')) addDays = 365
    else if (lowerPlan.includes('lifetime') || lowerPlan.includes('plan-4')) addDays = 36500

    const expireDate = new Date(startDate.getTime() + addDays * 24 * 60 * 60 * 1000)
    const vipExpireAt = expireDate.toISOString()
    const updatedAt = new Date().toISOString()

    database.prepare(`
      INSERT INTO vip_devices (deviceId, vipExpireAt, lastOrderId, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(deviceId) DO UPDATE SET
        vipExpireAt = excluded.vipExpireAt,
        lastOrderId = excluded.lastOrderId,
        updatedAt = excluded.updatedAt
    `).run(deviceId, vipExpireAt, orderId, updatedAt)

    return { deviceId, vipExpireAt, isVip: true }
  },

  revokeDeviceVip(deviceId) {
    if (!deviceId) return false
    const cleanId = String(deviceId).trim()
    database.prepare('DELETE FROM vip_devices WHERE deviceId = ?').run(cleanId)
    return true
  },


  getOrders() {
    const rows = database.prepare('SELECT * FROM orders ORDER BY createdAt DESC').all()
    return rows.map(r => {
      let isVip = false
      let vipExpireAt = null
      if (r.deviceId) {
        const deviceVip = this.getDeviceVip(r.deviceId)
        isVip = Boolean(deviceVip.isVip)
        vipExpireAt = deviceVip.vipExpireAt
      }
      return {
        ...r,
        isVip,
        vipExpireAt
      }
    })
  },


  getOrderById(id) {
    return database.prepare('SELECT * FROM orders WHERE id = ?').get(id)
  },

  createOrder(data) {
    const plans = this.getPlans()
    const plan = plans.find(p => p.id === data.planId || p.key === data.planId) || plans[0]
    const newId = data.orderId || `ORD-${Date.now()}`
    const createdAt = new Date().toISOString()
    const planName = plan ? plan.name : 'VIP 套餐'
    const amount = plan ? plan.price : 39
    const status = data.status || 'PENDING'

    const stmt = database.prepare(`
      INSERT INTO orders (id, planId, planName, amount, payType, status, deviceId, restoredCount, tradeNo, cryptoAddress, cryptoAmount, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `)

    stmt.run(
      newId,
      plan ? plan.id : (data.planId || null),
      planName,
      amount,
      data.payType || 'alipay',
      status,
      data.deviceId || null,
      data.tradeNo || null,
      data.cryptoAddress || null,
      data.cryptoAmount || 0,
      createdAt
    )

    if (status === 'PAID' && data.deviceId) {
      this.grantDeviceVip(data.deviceId, plan ? plan.id : 'month', newId)
    }

    return this.getOrderById(newId)
  },

  completeOrder(orderId, tradeNo = null) {
    const order = this.getOrderById(orderId)
    if (!order) return null
    if (order.status === 'PAID') {
      return order
    }

    database.prepare(`
      UPDATE orders
      SET status = 'PAID', tradeNo = ?
      WHERE id = ?
    `).run(tradeNo || order.tradeNo || `TX-${Date.now()}`, orderId)

    const updatedOrder = this.getOrderById(orderId)
    if (updatedOrder.deviceId) {
      this.grantDeviceVip(updatedOrder.deviceId, updatedOrder.planId, orderId)
    }

    return updatedOrder
  },

  restoreVipByOrder(orderId, targetDeviceId) {
    const order = this.getOrderById(orderId)
    if (!order) {
      return { success: false, message: '未找到该订单号，请检查输入或联系客服' }
    }
    if (order.status !== 'PAID') {
      return { success: false, message: '该订单尚未支付完成，无法恢复 VIP' }
    }
    if (order.restoredCount >= 1) {
      return { success: false, message: '该订单已通过订单号恢复过 1 次，无法重复恢复。如有疑问请联系客服处理' }
    }

    // Mark as restored once
    database.prepare('UPDATE orders SET restoredCount = restoredCount + 1 WHERE id = ?').run(orderId)

    // Grant VIP to targetDeviceId
    const vipRes = this.grantDeviceVip(targetDeviceId, order.planId, orderId)

    return {
      success: true,
      message: 'VIP 权限已成功恢复并绑定至当前设备！',
      vipExpireAt: vipRes.vipExpireAt
    }
  },

  getStats() {
    const totalVideos = database.prepare('SELECT COUNT(*) as c FROM videos').get().c
    const vipVideos = database.prepare('SELECT COUNT(*) as c FROM videos WHERE isVip = 1').get().c
    const totalOrders = database.prepare('SELECT COUNT(*) as c FROM orders').get().c
    const revRow = database.prepare('SELECT SUM(amount) as sum FROM orders').get()
    const totalRevenue = revRow && revRow.sum ? revRow.sum : 0

    return {
      totalVideos,
      vipVideos,
      totalOrders,
      totalRevenue,
      todayViews: 14208
    }
  },

  getSettings() {
    const rows = database.prepare('SELECT * FROM settings').all()
    const settings = {
      enableSeekPreview: true,
      heroImageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop',
      heroTitle: '极致诱惑',
      heroSubtitle: '滑动探索更多独家无删减内容',
      enableNotice: true,
      noticeTitle: '📢 官方重要公告',
      noticeContent: '欢迎来到 StreamVIP 独家流媒体平台！升级尊享 VIP 会员可无限制观看全站无删减 4K 超清原画库！客服在线时间：10:00 - 24:00。'
    }
    for (const r of rows) {
      if (r.key === 'enableSeekPreview' || r.key === 'enableNotice') {
        settings[r.key] = r.value === 'true'
      } else {
        settings[r.key] = r.value
      }
    }
    return settings
  },

  updateSettings(data) {
    const stmt = database.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)

    for (const [k, v] of Object.entries(data)) {
      stmt.run(k, String(v))
    }

    return this.getSettings()
  },

  recordAccess(data = {}) {
    const ip = data.ip || '127.0.0.1'
    const location = getIpLocation(ip)
    const createdAt = new Date().toISOString()
    const action = data.action || 'PV'

    const stmt = database.prepare(`
      INSERT INTO access_logs (ip, location, userAgent, referer, path, videoId, action, deviceId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      ip,
      location,
      data.userAgent || '',
      data.referer || '',
      data.path || '/',
      data.videoId || null,
      action,
      data.deviceId || null,
      createdAt
    )

    if (action === 'VIDEO_CLICK' && data.videoId) {
      try {
        database.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(data.videoId)
      } catch (e) { }
    }

    return { success: true, location }
  },

  getAnalyticsOverview() {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    const totalPV = database.prepare("SELECT COUNT(*) as c FROM access_logs WHERE action = 'PV' OR action IS NULL").get().c
    const todayPV = database.prepare("SELECT COUNT(*) as c FROM access_logs WHERE (action = 'PV' OR action IS NULL) AND createdAt >= ?").get(todayStart).c

    const totalUV = database.prepare("SELECT COUNT(DISTINCT deviceId) as c FROM access_logs WHERE deviceId IS NOT NULL AND deviceId != ''").get().c
    const todayUV = database.prepare("SELECT COUNT(DISTINCT deviceId) as c FROM access_logs WHERE deviceId IS NOT NULL AND deviceId != '' AND createdAt >= ?").get(todayStart).c

    const totalIPs = database.prepare("SELECT COUNT(DISTINCT ip) as c FROM access_logs").get().c
    const todayIPs = database.prepare("SELECT COUNT(DISTINCT ip) as c FROM access_logs WHERE createdAt >= ?").get(todayStart).c

    const totalClicks = database.prepare("SELECT COUNT(*) as c FROM access_logs WHERE action = 'VIDEO_CLICK'").get().c
    const todayClicks = database.prepare("SELECT COUNT(*) as c FROM access_logs WHERE action = 'VIDEO_CLICK' AND createdAt >= ?").get(todayStart).c

    return {
      totalPV,
      todayPV,
      totalUV,
      todayUV,
      totalIPs,
      todayIPs,
      totalClicks,
      todayClicks
    }
  },

  getAnalyticsTrend(days = 7) {
    const dates = []
    const pv = []
    const uv = []
    const ips = []
    const clicks = []

    const now = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const nextD = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1)
      const nextDateStr = nextD.toISOString().split('T')[0]

      const dayStart = `${dateStr}T00:00:00.000Z`
      const dayEnd = `${nextDateStr}T00:00:00.000Z`

      dates.push(`${d.getMonth() + 1}/${d.getDate()}`)

      const pvCount = database.prepare("SELECT COUNT(*) as c FROM access_logs WHERE createdAt >= ? AND createdAt < ? AND (action = 'PV' OR action IS NULL)").get(dayStart, dayEnd).c
      const uvCount = database.prepare("SELECT COUNT(DISTINCT deviceId) as c FROM access_logs WHERE createdAt >= ? AND createdAt < ? AND deviceId IS NOT NULL AND deviceId != ''").get(dayStart, dayEnd).c
      const ipCount = database.prepare("SELECT COUNT(DISTINCT ip) as c FROM access_logs WHERE createdAt >= ? AND createdAt < ?").get(dayStart, dayEnd).c
      const clickCount = database.prepare("SELECT COUNT(*) as c FROM access_logs WHERE createdAt >= ? AND createdAt < ? AND action = 'VIDEO_CLICK'").get(dayStart, dayEnd).c

      pv.push(pvCount)
      uv.push(uvCount)
      ips.push(ipCount)
      clicks.push(clickCount)
    }

    return { dates, pv, uv, ips, clicks }
  },

  getTopVideos(limit = 10) {
    const rows = database.prepare("SELECT id, title, poster, author, isVip, views, likes FROM videos ORDER BY views DESC, likes DESC LIMIT ?").all(limit)
    return rows.map(r => ({ ...r, isVip: Boolean(r.isVip) }))
  },

  getAccessLogs(options = {}) {
    const page = Number(options.page) || 1
    const pageSize = Number(options.pageSize) || 20
    const offset = (page - 1) * pageSize

    let whereClause = "WHERE 1=1"
    const params = []

    if (options.ip) {
      whereClause += " AND ip LIKE ?"
      params.push(`%${options.ip.trim()}%`)
    }
    if (options.action) {
      whereClause += " AND action = ?"
      params.push(options.action)
    }

    const totalRow = database.prepare(`SELECT COUNT(*) as c FROM access_logs ${whereClause}`).get(...params)
    const total = totalRow ? totalRow.c : 0

    const rows = database.prepare(`SELECT * FROM access_logs ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset)

    return {
      list: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1
    }
  },

  clearAccessLogs(options = {}) {
    if (options.clearAll) {
      const result = database.prepare("DELETE FROM access_logs").run()
      return { success: true, deletedCount: result.changes }
    }
    if (options.beforeDate) {
      const result = database.prepare("DELETE FROM access_logs WHERE createdAt < ?").run(options.beforeDate)
      return { success: true, deletedCount: result.changes }
    }
    return { success: false, message: '请指定清理条件（如 beforeDate 或 clearAll）' }
  }
}

