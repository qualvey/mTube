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

// ⚠️ 数据保护：WAL 模式（崩溃安全 + 读写并发），busy_timeout 避免锁冲突
// 硬性要求：管理端数据一条不能丢
try {
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA busy_timeout = 5000;')
  database.exec('PRAGMA synchronous = NORMAL;')
} catch (e) {
  console.warn('⚠️ [SQLite] PRAGMA 设置失败:', e.message)
}

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

try {
  database.exec("ALTER TABLE videos ADD COLUMN publishAt TEXT DEFAULT NULL;")
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

  -- i18n 动态内容翻译表：通用设计，新增语言零表结构变更
  -- entityType: video | plan | site（站点级文案：公告/协议/Hero 等）
  -- entityId: 对应实体主键（site 固定为 'site'）
  -- locale: 'en' 等目标语言；中文为源语言不存译文（无译文自动回退中文）
  CREATE TABLE IF NOT EXISTS translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entityType TEXT NOT NULL,
    entityId TEXT NOT NULL,
    locale TEXT NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE(entityType, entityId, locale, field)
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

  CREATE TABLE IF NOT EXISTS analytics_events (
    eventId TEXT PRIMARY KEY,
    eventName TEXT NOT NULL,
    occurredAt TEXT NOT NULL,
    receivedAt TEXT NOT NULL,
    visitorId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    pageViewId TEXT NOT NULL,
    playbackId TEXT DEFAULT NULL,
    videoId TEXT DEFAULT NULL,
    path TEXT DEFAULT '/',
    watchSeconds REAL DEFAULT 0,
    positionSeconds REAL DEFAULT 0,
    durationSeconds REAL DEFAULT 0,
    userAgent TEXT DEFAULT '',
    referer TEXT DEFAULT '',
    ipHash TEXT DEFAULT '',
    clientIp TEXT DEFAULT '',
    properties TEXT DEFAULT '{}',
    isValid INTEGER DEFAULT 1,
    invalidReason TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS video_stats (
    videoId TEXT PRIMARY KEY,
    validViews INTEGER DEFAULT 0,
    watchSeconds REAL DEFAULT 0,
    completes INTEGER DEFAULT 0,
    updatedAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_analytics_events_name_received
    ON analytics_events (eventName, receivedAt);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor_received
    ON analytics_events (visitorId, receivedAt);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_video_received
    ON analytics_events (videoId, receivedAt);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_session
    ON analytics_events (sessionId, receivedAt);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_path_received
    ON analytics_events (path, receivedAt);

  -- ============================================================
  -- 数据分析聚合层（写路径：事件入库同一事务内累加，报表永不扫原始表）
  -- ============================================================
  -- 全站日汇总（T+1 后冻结，仅当日行持续更新）
  CREATE TABLE IF NOT EXISTS daily_overview (
    date TEXT PRIMARY KEY,
    pv INTEGER DEFAULT 0,
    uv INTEGER DEFAULT 0,
    starts INTEGER DEFAULT 0,
    validViews INTEGER DEFAULT 0,
    progress25 INTEGER DEFAULT 0,
    progress50 INTEGER DEFAULT 0,
    progress75 INTEGER DEFAULT 0,
    completes INTEGER DEFAULT 0,
    watchSeconds REAL DEFAULT 0,
    validEvents INTEGER DEFAULT 0,
    totalEvents INTEGER DEFAULT 0,
    updatedAt TEXT NOT NULL
  );

  -- 视频日维度
  CREATE TABLE IF NOT EXISTS daily_video (
    date TEXT NOT NULL,
    videoId TEXT NOT NULL,
    starts INTEGER DEFAULT 0,
    validViews INTEGER DEFAULT 0,
    progress25 INTEGER DEFAULT 0,
    progress50 INTEGER DEFAULT 0,
    progress75 INTEGER DEFAULT 0,
    completes INTEGER DEFAULT 0,
    watchSeconds REAL DEFAULT 0,
    PRIMARY KEY (date, videoId)
  );

  -- 页面日维度
  CREATE TABLE IF NOT EXISTS daily_path (
    date TEXT NOT NULL,
    path TEXT NOT NULL,
    pv INTEGER DEFAULT 0,
    uv INTEGER DEFAULT 0,
    PRIMARY KEY (date, path)
  );

  -- 设备日维度
  CREATE TABLE IF NOT EXISTS daily_device (
    date TEXT NOT NULL,
    device TEXT NOT NULL,
    pv INTEGER DEFAULT 0,
    uv INTEGER DEFAULT 0,
    PRIMARY KEY (date, device)
  );

  -- 国家/地区日维度（地理画像，仅存 ISO 国家码，不存 IP）
  CREATE TABLE IF NOT EXISTS daily_country (
    date TEXT NOT NULL,
    countryCode TEXT NOT NULL,
    pv INTEGER DEFAULT 0,
    uv INTEGER DEFAULT 0,
    PRIMARY KEY (date, countryCode)
  );

  -- 去重集合表（UV 精确计数，按日 × 维度）
  CREATE TABLE IF NOT EXISTS daily_visitor (
    date TEXT NOT NULL,
    visitorId TEXT NOT NULL,
    PRIMARY KEY (date, visitorId)
  );
  CREATE TABLE IF NOT EXISTS daily_path_visitor (
    date TEXT NOT NULL,
    path TEXT NOT NULL,
    visitorId TEXT NOT NULL,
    PRIMARY KEY (date, path, visitorId)
  );
  CREATE TABLE IF NOT EXISTS daily_device_visitor (
    date TEXT NOT NULL,
    device TEXT NOT NULL,
    visitorId TEXT NOT NULL,
    PRIMARY KEY (date, device, visitorId)
  );
  CREATE TABLE IF NOT EXISTS daily_country_visitor (
    date TEXT NOT NULL,
    countryCode TEXT NOT NULL,
    visitorId TEXT NOT NULL,
    PRIMARY KEY (date, countryCode, visitorId)
  );

  -- 会话表（会话数 / 跳出率 / 人均页数 / 平均会话时长）
  CREATE TABLE IF NOT EXISTS sessions (
    sessionId TEXT PRIMARY KEY,
    visitorId TEXT NOT NULL,
    firstAt TEXT NOT NULL,
    lastAt TEXT NOT NULL,
    pageViews INTEGER DEFAULT 0,
    ipHash TEXT DEFAULT '',
    userAgent TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_first ON sessions (firstAt);
  CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions (visitorId);

  CREATE TABLE IF NOT EXISTS storage_nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    baseUrl TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    isDefault INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  );
`)

try { database.exec("ALTER TABLE orders ADD COLUMN deviceId TEXT DEFAULT NULL;"); } catch (e) { }
try { database.exec("ALTER TABLE orders ADD COLUMN restoredCount INTEGER DEFAULT 0;"); } catch (e) { }
try { database.exec("ALTER TABLE orders ADD COLUMN tradeNo TEXT DEFAULT NULL;"); } catch (e) { }
try { database.exec("ALTER TABLE orders ADD COLUMN cryptoAddress TEXT DEFAULT NULL;"); } catch (e) { }
try { database.exec("ALTER TABLE orders ADD COLUMN cryptoAmount REAL DEFAULT 0;"); } catch (e) { }
try { database.exec("ALTER TABLE videos ADD COLUMN views INTEGER DEFAULT 0;"); } catch (e) { }
try { database.exec("ALTER TABLE analytics_events ADD COLUMN countryCode TEXT DEFAULT '';"); } catch (e) { }
try { database.exec("ALTER TABLE analytics_events ADD COLUMN clientIp TEXT DEFAULT '';"); } catch (e) { }
try { database.exec("ALTER TABLE videos ADD COLUMN storageNodeId TEXT DEFAULT 'node-01';"); } catch (e) { }
try { database.exec("ALTER TABLE storage_nodes ADD COLUMN lastHeartbeat TEXT DEFAULT NULL;"); } catch (e) { }
try { database.exec("ALTER TABLE storage_nodes ADD COLUMN clusterSecret TEXT DEFAULT NULL;"); } catch (e) { }

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
  ('siteTitle', 'StreamVIP - 独家超清视频流与VIP特权'),
  ('noticeTitle', '📢 官方重要公告'),
  ('noticeContent', '欢迎来到 StreamVIP 独家流媒体平台！升级尊享 VIP 会员可无限制观看全站无删减 4K 超清原画库！客服在线时间：10:00 - 24:00。'),
  ('activeStorageNodeUrl', 'http://localhost:3001')
`).run()

// Seed default storage nodes if table is empty
const checkNodes = database.prepare('SELECT COUNT(*) as count FROM storage_nodes').get()
if (!checkNodes || checkNodes.count === 0) {
  database.prepare(`
    INSERT OR IGNORE INTO storage_nodes (id, name, baseUrl, status, isDefault, createdAt) VALUES
    ('node-01', '存储节点 01 (主节点)', 'http://localhost:3001', 'ACTIVE', 1, '${new Date().toISOString()}'),
    ('node-02', '存储节点 02 (备用节点)', 'http://localhost:3002', 'ACTIVE', 0, '${new Date().toISOString()}')
  `).run()
}


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
    : []

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

const ipCache = new Map()

export const getIpLocation = (ip, reqHeaders = {}) => {
  if (!ip) return '未知位置'
  const cleanIp = String(ip).replace(/^::ffff:/, '').trim()
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    return '本地开发环境'
  }
  if (cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.16.') || cleanIp.startsWith('172.31.')) {
    return '局域网 / 内网 IP'
  }

  // 1. 从内存缓存中获取已查询过的真实 IP 地理位置
  if (ipCache.has(cleanIp)) {
    return ipCache.get(cleanIp)
  }

  // 2. 优先检查 CDN / Proxy 请求头 (如 Cloudflare)
  const cfCountry = reqHeaders['cf-ipcountry']
  const cfCity = reqHeaders['cf-ipcity']
  if (cfCountry) {
    const loc = cfCity ? `${cfCountry} ${decodeURIComponent(cfCity)}` : `Cloudflare (${cfCountry})`
    return loc
  }

  return '公网 IP'
}

const formatVideoRow = (row) => {
  if (!row) return null
  const rawPoster = row.poster ? row.poster.trim() : ''
  const poster = rawPoster || `/api/v1/proxy/poster?id=${row.id}`
  return {
    ...row,
    poster,
    storageNodeId: row.storageNodeId || 'node-01',
    isVip: Boolean(row.isVip),
    views: Number(row.views || 0),
    validViews: Number(row.validViews || 0),
    watchSeconds: Number(row.watchSeconds || 0),
    completes: Number(row.completes || 0),
    previewDuration: row.previewDuration !== undefined && row.previewDuration !== null ? Number(row.previewDuration) : 120,
    tags: parseTags(row.tags)
  }
}

// ============================================================================
// 数据分析聚合层：事件入库同一事务内累加，报表只读 daily_* / sessions 聚合表
// 原始事件表仅用于审计与重建。广告事件（AD_*）暂只入原始表，
// 广告漏斗聚合表在广告系统接入时按同一模式扩展。
// ============================================================================

const classifyDevice = (userAgent = '') => {
  const ua = String(userAgent || '').toLowerCase()
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet'
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile'
  if (!ua) return 'unknown'
  return 'desktop'
}

const upsertDailyOverview = database.prepare(`
  INSERT INTO daily_overview (date, pv, uv, starts, validViews, progress25, progress50, progress75, completes, watchSeconds, validEvents, totalEvents, updatedAt)
  VALUES (@date, @pv, @uv, @starts, @validViews, @p25, @p50, @p75, @completes, @watchSeconds, @validEvents, @totalEvents, @updatedAt)
  ON CONFLICT(date) DO UPDATE SET
    pv = pv + @pv, uv = uv + @uv, starts = starts + @starts, validViews = validViews + @validViews,
    progress25 = progress25 + @p25, progress50 = progress50 + @p50, progress75 = progress75 + @p75,
    completes = completes + @completes, watchSeconds = watchSeconds + @watchSeconds,
    validEvents = validEvents + @validEvents, totalEvents = totalEvents + @totalEvents,
    updatedAt = @updatedAt
`)

const upsertDailyVideo = database.prepare(`
  INSERT INTO daily_video (date, videoId, starts, validViews, progress25, progress50, progress75, completes, watchSeconds)
  VALUES (@date, @videoId, @starts, @validViews, @p25, @p50, @p75, @completes, @watchSeconds)
  ON CONFLICT(date, videoId) DO UPDATE SET
    starts = starts + @starts, validViews = validViews + @validViews,
    progress25 = progress25 + @p25, progress50 = progress50 + @p50, progress75 = progress75 + @p75,
    completes = completes + @completes, watchSeconds = watchSeconds + @watchSeconds
`)

const upsertDailyPath = database.prepare(`
  INSERT INTO daily_path (date, path, pv, uv) VALUES (@date, @path, @pv, @uv)
  ON CONFLICT(date, path) DO UPDATE SET pv = pv + @pv, uv = uv + @uv
`)

const upsertDailyDevice = database.prepare(`
  INSERT INTO daily_device (date, device, pv, uv) VALUES (@date, @device, @pv, @uv)
  ON CONFLICT(date, device) DO UPDATE SET pv = pv + @pv, uv = uv + @uv
`)

const upsertDailyCountry = database.prepare(`
  INSERT INTO daily_country (date, countryCode, pv, uv) VALUES (@date, @countryCode, @pv, @uv)
  ON CONFLICT(date, countryCode) DO UPDATE SET pv = pv + @pv, uv = uv + @uv
`)

const insertDailyVisitor = database.prepare('INSERT OR IGNORE INTO daily_visitor (date, visitorId) VALUES (?, ?)')
const insertDailyPathVisitor = database.prepare('INSERT OR IGNORE INTO daily_path_visitor (date, path, visitorId) VALUES (?, ?, ?)')
const insertDailyDeviceVisitor = database.prepare('INSERT OR IGNORE INTO daily_device_visitor (date, device, visitorId) VALUES (?, ?, ?)')
const insertDailyCountryVisitor = database.prepare('INSERT OR IGNORE INTO daily_country_visitor (date, countryCode, visitorId) VALUES (?, ?, ?)')

const insertSession = database.prepare(`
  INSERT OR IGNORE INTO sessions (sessionId, visitorId, firstAt, lastAt, pageViews, ipHash, userAgent)
  VALUES (?, ?, ?, ?, 1, ?, ?)
`)
const updateSession = database.prepare('UPDATE sessions SET lastAt = ?, pageViews = pageViews + 1 WHERE sessionId = ?')

// 累计表（供视频列表/详情 API 快速读取，与日聚合同事务维护）
const upsertView = database.prepare(`
  INSERT INTO video_stats (videoId, validViews, watchSeconds, completes, updatedAt)
  VALUES (?, 1, 0, 0, ?)
  ON CONFLICT(videoId) DO UPDATE SET
    validViews = validViews + 1,
    updatedAt = excluded.updatedAt
`)
const upsertWatchTime = database.prepare(`
  INSERT INTO video_stats (videoId, validViews, watchSeconds, completes, updatedAt)
  VALUES (?, 0, ?, 0, ?)
  ON CONFLICT(videoId) DO UPDATE SET
    watchSeconds = watchSeconds + excluded.watchSeconds,
    updatedAt = excluded.updatedAt
`)
const upsertComplete = database.prepare(`
  INSERT INTO video_stats (videoId, validViews, watchSeconds, completes, updatedAt)
  VALUES (?, 0, 0, 1, ?)
  ON CONFLICT(videoId) DO UPDATE SET
    completes = completes + 1,
    updatedAt = excluded.updatedAt
`)
const videoExists = database.prepare('SELECT 1 FROM videos WHERE id = ?')

const applyEventToAggregates = (event) => {
  const eventName = event.eventName
  const isValid = event.isValid !== false && event.isValid !== 0
  const date = String(event.receivedAt || '').slice(0, 10)
  if (!date) return

  const delta = {
    date,
    pv: 0, uv: 0, starts: 0, validViews: 0, p25: 0, p50: 0, p75: 0, completes: 0,
    watchSeconds: 0, validEvents: isValid ? 1 : 0, totalEvents: 1,
    updatedAt: event.receivedAt
  }
  const videoDelta = {
    date, videoId: event.videoId,
    starts: 0, validViews: 0, p25: 0, p50: 0, p75: 0, completes: 0, watchSeconds: 0
  }

  if (isValid) {
    const visitorId = event.visitorId
    switch (eventName) {
      case 'PAGE_VIEW': {
        delta.pv = 1
        if (insertDailyVisitor.run(date, visitorId).changes === 1) delta.uv = 1
        const path = event.path || '/'
        const pathUv = insertDailyPathVisitor.run(date, path, visitorId).changes === 1 ? 1 : 0
        upsertDailyPath.run({ date, path, pv: 1, uv: pathUv })
        const device = classifyDevice(event.userAgent)
        const deviceUv = insertDailyDeviceVisitor.run(date, device, visitorId).changes === 1 ? 1 : 0
        upsertDailyDevice.run({ date, device, pv: 1, uv: deviceUv })
        const countryCode = String(event.countryCode || '').toUpperCase().slice(0, 2)
        if (countryCode) {
          const countryUv = insertDailyCountryVisitor.run(date, countryCode, visitorId).changes === 1 ? 1 : 0
          upsertDailyCountry.run({ date, countryCode, pv: 1, uv: countryUv })
        }
        if (insertSession.run(event.sessionId, visitorId, event.receivedAt, event.receivedAt, event.ipHash || '', event.userAgent || '').changes !== 1) {
          updateSession.run(event.receivedAt, event.sessionId)
        }
        break
      }
      case 'VIDEO_START': delta.starts = 1; videoDelta.starts = 1; break
      case 'VIDEO_2S': delta.validViews = 1; videoDelta.validViews = 1; break
      case 'VIDEO_25': delta.p25 = 1; videoDelta.p25 = 1; break
      case 'VIDEO_50': delta.p50 = 1; videoDelta.p50 = 1; break
      case 'VIDEO_75': delta.p75 = 1; videoDelta.p75 = 1; break
      case 'VIDEO_COMPLETE': delta.completes = 1; videoDelta.completes = 1; break
      case 'WATCH_TIME': {
        const seconds = Number(event.watchSeconds || 0)
        if (seconds > 0) {
          delta.watchSeconds = seconds
          videoDelta.watchSeconds = seconds
        }
        break
      }
      default:
        // AD_* / PAYWALL_OPEN 等仅入原始事件表，后续按需扩展聚合
        break
    }
  }

  upsertDailyOverview.run(delta)

  if (isValid && event.videoId && videoExists.get(event.videoId)) {
    if (videoDelta.starts || videoDelta.validViews || videoDelta.p25 || videoDelta.p50 || videoDelta.p75 || videoDelta.completes || videoDelta.watchSeconds > 0) {
      upsertDailyVideo.run(videoDelta)
    }
    // 累计表：视频列表/详情 API 直接读取
    if (eventName === 'VIDEO_2S') upsertView.run(event.videoId, event.receivedAt)
    else if (eventName === 'WATCH_TIME' && Number(event.watchSeconds || 0) > 0) upsertWatchTime.run(event.videoId, Number(event.watchSeconds || 0), event.receivedAt)
    else if (eventName === 'VIDEO_COMPLETE') upsertComplete.run(event.videoId, event.receivedAt)
  }
}

export const db = {
  // ── i18n 动态内容翻译（通用翻译表抽象，新增语言零代码改动） ────────────────
  // 可翻译字段白名单（按实体类型）
  TRANSLATABLE_FIELDS: {
    video: ['title', 'description', 'author'],
    plan: ['name', 'description', 'badgeText'],
    site: ['heroTitle', 'heroSubtitle', 'noticeTitle', 'noticeContent', 'paywallNotice', 'userAgreement', 'customerServiceText']
  },

  getTranslations(options = {}) {
    const { entityType, entityId, locale } = options
    let sql = 'SELECT * FROM translations WHERE 1=1'
    const params = []
    if (entityType) { sql += ' AND entityType = ?'; params.push(entityType) }
    if (entityId) { sql += ' AND entityId = ?'; params.push(String(entityId)) }
    if (locale) { sql += ' AND locale = ?'; params.push(locale) }
    sql += ' ORDER BY entityType, entityId, locale, field'
    return database.prepare(sql).all(...params)
  },

  upsertTranslation({ entityType, entityId, locale, field, value }) {
    if (!entityType || entityId === undefined || entityId === null || !locale || !field) return null
    const now = new Date().toISOString()
    database.prepare(`
      INSERT INTO translations (entityType, entityId, locale, field, value, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entityType, entityId, locale, field)
      DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run(entityType, String(entityId), locale, field, String(value ?? ''), now, now)
    return this.getTranslations({ entityType, entityId, locale })
  },

  // 批量保存一个实体的多个字段译文（fields: { title: '...', description: '...' }）
  saveTranslations({ entityType, entityId, locale, fields }) {
    if (!entityType || entityId === undefined || entityId === null || !locale || !fields || typeof fields !== 'object') return null
    for (const [field, value] of Object.entries(fields)) {
      this.upsertTranslation({ entityType, entityId, locale, field, value })
    }
    return this.getTranslations({ entityType, entityId, locale })
  },

  // 内部：翻译应用到单个实体（无译文回退源语言字段）
  applyLangToEntity(entityType, entity, locale) {
    if (!locale || locale === 'zh' || !entity) return entity
    const rows = database.prepare(
      'SELECT field, value FROM translations WHERE entityType = ? AND entityId = ? AND locale = ?'
    ).all(entityType, String(entity.id), locale)
    if (!rows.length) return entity
    const out = { ...entity }
    for (const r of rows) {
      if (r.value && this.TRANSLATABLE_FIELDS[entityType]?.includes(r.field)) {
        out[r.field] = r.value
      }
    }
    return out
  },

  // 内部：批量应用翻译（单次 SQL 查询，避免 N+1）
  applyLangToEntities(entityType, entities, locale) {
    if (!locale || locale === 'zh' || !entities || entities.length === 0) return entities
    const ids = entities.map(e => e.id)
    const placeholders = ids.map(() => '?').join(',')
    const rows = database.prepare(
      `SELECT entityId, field, value FROM translations
       WHERE entityType = ? AND locale = ? AND entityId IN (${placeholders})`
    ).all(entityType, locale, ...ids)
    if (!rows.length) return entities
    const map = {}
    for (const r of rows) {
      if (!map[r.entityId]) map[r.entityId] = {}
      map[r.entityId][r.field] = r.value
    }
    const fields = this.TRANSLATABLE_FIELDS[entityType] || []
    return entities.map(e => {
      const t = map[e.id]
      if (!t) return e
      const out = { ...e }
      for (const f of fields) {
        if (t[f]) out[f] = t[f]
      }
      return out
    })
  },

  // 管理端概览：每个实体 + 已录入译文摘要（{ locale: [fields...] }）
  getTranslationOverview(entityType = 'video') {
    const entities = entityType === 'plan'
      ? this.getPlans()
      : entityType === 'site'
        ? [{ id: 'site', title: '站点级文案（公告/协议/Hero/客服）' }]
        : this.getVideos()
    const rows = database.prepare(
      'SELECT entityId, locale, field FROM translations WHERE entityType = ? ORDER BY entityId, locale'
    ).all(entityType)
    const map = {}
    for (const r of rows) {
      if (!map[r.entityId]) map[r.entityId] = {}
      if (!map[r.entityId][r.locale]) map[r.entityId][r.locale] = []
      map[r.entityId][r.locale].push(r.field)
    }
    return entities.map(e => ({
      ...e,
      translations: map[e.id] || {}
    }))
  },

  getVideos(options = {}) {
    const lang = typeof options === 'object' ? options.lang : null
    const filter = typeof options === 'string' ? options : options.filter
    const tag = typeof options === 'object' ? options.tag : null
    const search = typeof options === 'object' ? options.search : null
    const pageParam = options.page !== undefined ? parseInt(options.page) : null
    const limitParam = options.limit !== undefined ? parseInt(options.limit) : null

    // 定时发布懒晋升：已到时间的 SCHEDULED 自动转为 PUBLISHED（C 端可见）
    this.publishDueVideos()

    let where = ''
    // 非管理端（includeScheduled 未设置）：只暴露已发布视频，隐藏未到时间的待发布队列
    if (!options.includeScheduled) {
      where = "WHERE videos.status = 'PUBLISHED'"
      if (filter === 'vip') where += ' AND videos.isVip = 1'
      else if (filter === 'free') where += ' AND videos.isVip = 0'
    } else if (filter === 'vip') {
      where = 'WHERE videos.isVip = 1'
    } else if (filter === 'free') {
      where = 'WHERE videos.isVip = 0'
    }

    const allRows = database.prepare(`
      SELECT videos.*,
        COALESCE(video_stats.validViews, 0) AS validViews,
        COALESCE(video_stats.watchSeconds, 0) AS watchSeconds,
        COALESCE(video_stats.completes, 0) AS completes
      FROM videos
      LEFT JOIN video_stats ON video_stats.videoId = videos.id
      ${where}
      ORDER BY videos.createdAt DESC
    `).all()
    let results = allRows.map(formatVideoRow)

    if (tag && tag.trim()) {
      const targetTag = tag.trim().toLowerCase()
      results = results.filter(v => v.tags && v.tags.some(t => String(t).toLowerCase() === targetTag))
    }

    // i18n：按 lang 覆盖 title/description/author（无译文自动回退中文）
    results = this.applyLangToEntities('video', results, lang)

    // 搜索：对翻译后的 title/description/author 做子字符匹配（用户用自己的语言搜索也能命中）
    if (search && search.trim()) {
      const term = search.trim().toLowerCase()
      results = results.filter(v =>
        (v.title && String(v.title).toLowerCase().includes(term)) ||
        (v.description && String(v.description).toLowerCase().includes(term)) ||
        (v.author && String(v.author).toLowerCase().includes(term))
      )
    }

    // \u5206\u9875\u6a21\u5f0f\uff08\u4f20\u5165 page/limit \u65f6\uff09
    if (pageParam !== null && limitParam !== null) {
      const total = results.length
      const totalPages = Math.ceil(total / limitParam) || 1
      const offset = (pageParam - 1) * limitParam
      const items = results.slice(offset, offset + limitParam)
      return { items, total, page: pageParam, limit: limitParam, totalPages }
    }

    // \u65e0\u5206\u9875\u65f6\u8fd4\u56de\u6570\u7ec4\uff08\u5185\u90e8\u8c03\u7528\u65b9\u5411\u540e\u517c\u5bb9\uff09
    return results
  },

  getVideoById(id, lang) {
    const row = database.prepare(`
      SELECT videos.*,
        COALESCE(video_stats.validViews, 0) AS validViews,
        COALESCE(video_stats.watchSeconds, 0) AS watchSeconds,
        COALESCE(video_stats.completes, 0) AS completes
      FROM videos
      LEFT JOIN video_stats ON video_stats.videoId = videos.id
      WHERE videos.id = ?
    `).get(id)
    const video = formatVideoRow(row)
    return video ? this.applyLangToEntity('video', video, lang) : null
  },

  updateVideoPoster(id, posterUrl) {
    const stmt = database.prepare('UPDATE videos SET poster = ? WHERE id = ?')
    stmt.run(posterUrl, id)
  },

  publishDueVideos() {
    const now = new Date().toISOString()
    const result = database.prepare(`
      UPDATE videos SET status = 'PUBLISHED'
      WHERE status = 'SCHEDULED' AND publishAt IS NOT NULL AND publishAt <= ?
    `).run(now)
    if (result.changes > 0) {
      logger.info(`[Scheduler] 定时发布: ${result.changes} 个视频已到时间自动发布`)
    }
    return result.changes
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

    const storageNodeId = data.storageNodeId || 'node-01'

    // 定时发布：status 仅允许 PUBLISHED / SCHEDULED；SCHEDULED 必须带 publishAt
    let status = data.status === 'SCHEDULED' ? 'SCHEDULED' : 'PUBLISHED'
    const publishAt = data.publishAt ? String(data.publishAt) : null
    if (status === 'SCHEDULED' && !publishAt) status = 'PUBLISHED'

    const stmt = database.prepare(`
      INSERT INTO videos (id, title, description, author, authorAvatar, videoUrl, poster, duration, likes, shares, isVip, status, tags, headers, previewDuration, storageNodeId, publishAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)
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
      status,
      tagsStr,
      headersStr,
      previewDuration,
      storageNodeId,
      publishAt,
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

    const storageNodeId = updated.storageNodeId || 'node-01'

    // 定时发布字段：status 仅允许 PUBLISHED / SCHEDULED；SCHEDULED 无 publishAt 时回退 PUBLISHED
    let status = updated.status === 'SCHEDULED' ? 'SCHEDULED' : 'PUBLISHED'
    const publishAt = updated.publishAt !== undefined && updated.publishAt !== null
      ? String(updated.publishAt)
      : null
    if (status === 'SCHEDULED' && !publishAt) status = 'PUBLISHED'

    const stmt = database.prepare(`
      UPDATE videos
      SET title = ?, description = ?, author = ?, authorAvatar = ?, videoUrl = ?, poster = ?, duration = ?, isVip = ?, tags = ?, headers = ?, previewDuration = ?, storageNodeId = ?, status = ?, publishAt = ?
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
      storageNodeId,
      status,
      publishAt,
      id
    )

    return this.getVideoById(id)
  },

  getStorageNodes() {
    const rows = database.prepare('SELECT * FROM storage_nodes ORDER BY isDefault DESC, createdAt ASC').all()
    return rows.map(r => ({ ...r, isDefault: Boolean(r.isDefault) }))
  },

  getStorageNodeById(id) {
    const row = database.prepare('SELECT * FROM storage_nodes WHERE id = ?').get(id)
    if (!row) return null
    return { ...row, isDefault: Boolean(row.isDefault) }
  },

  getDefaultStorageNode() {
    const row = database.prepare('SELECT * FROM storage_nodes WHERE isDefault = 1 LIMIT 1').get()
    if (row) return { ...row, isDefault: true }
    const nodes = this.getStorageNodes()
    return nodes[0] || { id: 'node-01', name: '存储节点 01', baseUrl: 'http://localhost:3001', isDefault: true }
  },

  addStorageNode(data) {
    const id = data.id ? data.id.trim() : `node-${Date.now()}`
    const isDefault = data.isDefault ? 1 : 0
    if (isDefault) {
      database.prepare('UPDATE storage_nodes SET isDefault = 0').run()
    }
    const stmt = database.prepare(`
      INSERT INTO storage_nodes (id, name, baseUrl, status, isDefault, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      id,
      data.name || '新存储节点',
      data.baseUrl || 'http://localhost:3001',
      data.status || 'ACTIVE',
      isDefault,
      new Date().toISOString()
    )
    return this.getStorageNodeById(id)
  },

  upsertStorageNode(data) {
    const id = data.id ? data.id.trim() : `node-${Date.now()}`
    const existing = this.getStorageNodeById(id)
    const nowStr = new Date().toISOString()

    if (existing) {
      const stmt = database.prepare(`
        UPDATE storage_nodes
        SET name = ?, baseUrl = ?, status = 'ONLINE', lastHeartbeat = ?
        WHERE id = ?
      `)
      stmt.run(
        data.name || existing.name,
        data.baseUrl || existing.baseUrl,
        nowStr,
        id
      )
      return this.getStorageNodeById(id)
    } else {
      const checkCount = database.prepare('SELECT COUNT(*) as c FROM storage_nodes').get().c
      const isDefault = (checkCount === 0 || data.isDefault) ? 1 : 0
      if (isDefault) {
        database.prepare('UPDATE storage_nodes SET isDefault = 0').run()
      }
      const stmt = database.prepare(`
        INSERT INTO storage_nodes (id, name, baseUrl, status, isDefault, lastHeartbeat, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        id,
        data.name || id,
        data.baseUrl || 'http://localhost:3001',
        'ONLINE',
        isDefault,
        nowStr,
        nowStr
      )
      return this.getStorageNodeById(id)
    }
  },

  updateStorageNodeHeartbeat(id, statusData = {}) {
    const nowStr = new Date().toISOString()
    const stmt = database.prepare(`
      UPDATE storage_nodes
      SET status = ?, lastHeartbeat = ?
      WHERE id = ?
    `)
    stmt.run(statusData.status || 'ONLINE', nowStr, id)
    return this.getStorageNodeById(id)
  },

  updateStorageNode(id, data) {
    const existing = this.getStorageNodeById(id)
    if (!existing) return null
    const updated = { ...existing, ...data }
    if (data.isDefault) {
      database.prepare('UPDATE storage_nodes SET isDefault = 0').run()
    }
    const stmt = database.prepare(`
      UPDATE storage_nodes
      SET name = ?, baseUrl = ?, status = ?, isDefault = ?
      WHERE id = ?
    `)
    stmt.run(
      updated.name,
      updated.baseUrl,
      updated.status || 'ACTIVE',
      updated.isDefault ? 1 : 0,
      id
    )
    return this.getStorageNodeById(id)
  },

  deleteStorageNode(id) {
    database.prepare('DELETE FROM storage_nodes WHERE id = ?').run(id)
    return true
  },

  setDefaultStorageNode(id) {
    database.prepare('UPDATE storage_nodes SET isDefault = 0').run()
    database.prepare('UPDATE storage_nodes SET isDefault = 1 WHERE id = ?').run(id)
    return this.getStorageNodeById(id)
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

  getPlans(lang) {
    const rows = database.prepare('SELECT * FROM plans').all()
    const plans = rows.map(r => ({ ...r, isHot: Boolean(r.isHot) }))
    return this.applyLangToEntities('plan', plans, lang)
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

  deleteOrder(id) {
    if (!id) return false
    const info = database.prepare('DELETE FROM orders WHERE id = ?').run(id)
    return info.changes > 0
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
    const totalOrders = database.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'PAID'").get().c
    const revRow = database.prepare("SELECT SUM(amount) as sum FROM orders WHERE status = 'PAID'").get()
    const totalRevenue = revRow && revRow.sum ? revRow.sum : 0

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const todayViewsRow = database.prepare("SELECT COUNT(*) as c FROM access_logs WHERE createdAt >= ?").get(todayStart)
    const todayViews = todayViewsRow ? todayViewsRow.c : 0

    return {
      totalVideos,
      vipVideos,
      totalOrders,
      totalRevenue,
      todayViews
    }
  },

  getSettings(lang) {
    const rows = database.prepare('SELECT * FROM settings').all()
    const settings = {
      // 收费模式全局开关（管理员控制）：false = 全站免费，付费墙/试看/VIP 全部停用
      paywallEnabled: false,
      enableSeekPreview: true,
      uploadChunkConcurrency: 4,
      heroImageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop',
      heroTitle: '极致诱惑',
      heroSubtitle: '滑动探索更多独家无删减内容',
      enableNotice: true,
      noticeTitle: '📢 官方重要公告',
      noticeContent: '欢迎来到 StreamVIP 独家流媒体平台！升级尊享 VIP 会员可无限制观看全站无删减 4K 超清原画库！客服在线时间：10:00 - 24:00。',
      paywallNotice: '支付成功后系统将自动为您开通 VIP 尊享特权，支持任意设备凭订单号恢复特权。',
      userAgreement: '【StreamVIP 用户服务协议与隐私条款】\n\n1. 协议范围：本协议是您与 StreamVIP 平台之间关于使用本平台无删减流媒体视频服务的法律协议。\n2. 会员特权：开通 VIP 会员后，您将在订阅有效期内享有全站 4K 原画视频无限制观看与免广告特权。\n3. 退款与售后：由于数字流媒体服务的即时交付特性，虚拟数字商品一经开通生效，概不退款。如有订单异常，请提供订单号联系官方客服协助恢复。',
      customerServiceText: '如有支付问题或需要协助，请联系官方客服 Telegram: @StreamVIP_Support'
    }
    for (const r of rows) {
      if (r.key === 'enableSeekPreview' || r.key === 'enableNotice' || r.key === 'paywallEnabled') {
        settings[r.key] = r.value === 'true'
      } else if (r.key === 'uploadChunkConcurrency') {
        settings[r.key] = Number(r.value) || 4
      } else {
        settings[r.key] = r.value
      }
    }
    // i18n：站点级文案按 lang 覆盖（公告/协议/Hero/客服等，无译文回退中文）
    if (lang && lang !== 'zh') {
      const tRows = this.getTranslations({ entityType: 'site', entityId: 'site', locale: lang })
      for (const r of tRows) {
        if (r.value && this.TRANSLATABLE_FIELDS.site.includes(r.field)) {
          settings[r.field] = r.value
        }
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

  recordAnalyticsEvents(events = []) {
    const insertEvent = database.prepare(`
      INSERT OR IGNORE INTO analytics_events (
        eventId, eventName, occurredAt, receivedAt, visitorId, sessionId, pageViewId,
        playbackId, videoId, path, watchSeconds, positionSeconds, durationSeconds,
        userAgent, referer, ipHash, clientIp, countryCode, properties, isValid, invalidReason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let accepted = 0
    let duplicates = 0

    database.exec('BEGIN')
    try {
      for (const event of events) {
        const result = insertEvent.run(
          event.eventId,
          event.eventName,
          event.occurredAt,
          event.receivedAt,
          event.visitorId,
          event.sessionId,
          event.pageViewId,
          event.playbackId || null,
          event.videoId || null,
          event.path || '/',
          event.watchSeconds || 0,
          event.positionSeconds || 0,
          event.durationSeconds || 0,
          event.userAgent || '',
          event.referer || '',
          event.ipHash || '',
          event.clientIp || '',
          event.countryCode || '',
          JSON.stringify(event.properties || {}),
          event.isValid === false ? 0 : 1,
          event.invalidReason || null
        )

        if (!result.changes) {
          duplicates += 1
          continue
        }

        accepted += 1
        applyEventToAggregates(event)
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }

    return { accepted, duplicates }
  },

  rebuildDailyAggregates() {
    // ⚠️ 数据保护（硬性要求）：rebuild 会清空聚合表并重放，执行前必须备份原始事件与统计表，
    // 保证管理端数据一条不丢。备份写入同目录 db.analytics-backup-<timestamp>.sqlite
    let backupPath = null
    try {
      backupPath = path.join(dataDir, `db.analytics-backup-${Date.now()}.sqlite`)
      fs.copyFileSync(DB_SQLITE_PATH, backupPath)
      console.log(`💾 [Analytics] 数据备份完成: ${backupPath}`)
    } catch (err) {
      console.error('❌ [Analytics] 备份失败，拒绝执行 rebuild:', err.message)
      return { success: false, message: `备份失败，已中止 rebuild: ${err.message}` }
    }

    database.exec('BEGIN')
    let rebuiltEvents = 0
    try {
      database.exec(`
        DELETE FROM daily_overview;
        DELETE FROM daily_video;
        DELETE FROM daily_path;
        DELETE FROM daily_device;
        DELETE FROM daily_country;
        DELETE FROM daily_visitor;
        DELETE FROM daily_path_visitor;
        DELETE FROM daily_device_visitor;
        DELETE FROM daily_country_visitor;
        DELETE FROM sessions;
        DELETE FROM video_stats;
      `)
      const rows = database.prepare('SELECT * FROM analytics_events ORDER BY rowid ASC').all()
      for (const row of rows) {
        applyEventToAggregates(row)
        rebuiltEvents += 1
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    return { rebuiltEvents, backupPath }
  },

  getAnalyticsV1Overview() {
    const totalPV = database.prepare("SELECT COUNT(*) AS c FROM analytics_events WHERE eventName = 'PAGE_VIEW' AND isValid = 1").get().c
    const totalUV = database.prepare("SELECT COUNT(DISTINCT visitorId) AS c FROM analytics_events WHERE eventName = 'PAGE_VIEW' AND isValid = 1").get().c
    const validViews = database.prepare('SELECT COALESCE(SUM(validViews), 0) AS c FROM video_stats').get().c
    const watchSeconds = database.prepare('SELECT COALESCE(SUM(watchSeconds), 0) AS c FROM video_stats').get().c
    const completes = database.prepare('SELECT COALESCE(SUM(completes), 0) AS c FROM video_stats').get().c
    return { totalPV, totalUV, validViews, watchSeconds, completes }
  },

  getAnalyticsV1Report(days = 7) {
    const requestedDays = Number(days)
    const rangeDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 7
    const dayMs = 24 * 60 * 60 * 1000
    const endDate = new Date()
    endDate.setUTCHours(0, 0, 0, 0)
    endDate.setUTCDate(endDate.getUTCDate() + 1)
    const startDate = new Date(endDate.getTime() - rangeDays * dayMs)
    const previousStartDate = new Date(startDate.getTime() - rangeDays * dayMs)
    const start = startDate.toISOString().slice(0, 10)
    const end = endDate.toISOString().slice(0, 10)
    const previousStart = previousStartDate.toISOString().slice(0, 10)

    // 全站汇总（读日聚合表，T+1 后冻结）
    const summaryStatement = database.prepare(`
      SELECT
        COALESCE(SUM(pv), 0) AS pv,
        COALESCE(SUM(uv), 0) AS uv,
        COALESCE(SUM(starts), 0) AS starts,
        COALESCE(SUM(validViews), 0) AS validViews,
        COALESCE(SUM(progress25), 0) AS progress25,
        COALESCE(SUM(progress50), 0) AS progress50,
        COALESCE(SUM(progress75), 0) AS progress75,
        COALESCE(SUM(completes), 0) AS completes,
        COALESCE(SUM(watchSeconds), 0) AS watchSeconds,
        COALESCE(SUM(validEvents), 0) AS validEvents,
        COALESCE(SUM(totalEvents), 0) AS totalEvents
      FROM daily_overview
      WHERE date >= ? AND date < ?
    `)

    const normalizeSummary = (row = {}) => {
      const summary = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]))
      summary.pagesPerVisitor = summary.uv ? summary.pv / summary.uv : 0
      summary.viewRate = summary.starts ? summary.validViews / summary.starts : 0
      summary.completionRate = summary.validViews ? summary.completes / summary.validViews : 0
      summary.averageWatchSeconds = summary.validViews ? summary.watchSeconds / summary.validViews : 0
      summary.eventValidityRate = summary.totalEvents ? summary.validEvents / summary.totalEvents : 1
      return summary
    }

    const summary = normalizeSummary(summaryStatement.get(start, end))
    const previous = normalizeSummary(summaryStatement.get(previousStart, start))

    // 会话指标：按 firstAt 归属日期（30 分钟会话窗口，跨日误差可忽略）
    const sessionStatement = database.prepare(`
      SELECT
        COUNT(*) AS sessions,
        SUM(CASE WHEN pageViews = 1 THEN 1 ELSE 0 END) AS bounceSessions,
        COALESCE(AVG((julianday(lastAt) - julianday(firstAt)) * 86400), 0) AS averageSessionSeconds
      FROM sessions
      WHERE firstAt >= ? AND firstAt < ?
    `)
    const sessionStats = sessionStatement.get(`${start}T00:00:00.000Z`, `${end}T00:00:00.000Z`) || {}
    const previousSessionStats = sessionStatement.get(`${previousStart}T00:00:00.000Z`, `${start}T00:00:00.000Z`) || {}
    summary.sessions = Number(sessionStats.sessions || 0)
    summary.bounceSessions = Number(sessionStats.bounceSessions || 0)
    summary.bounceRate = summary.sessions ? summary.bounceSessions / summary.sessions : 0
    summary.averageSessionSeconds = Number(sessionStats.averageSessionSeconds || 0)
    summary.pagesPerSession = summary.sessions ? summary.pv / summary.sessions : 0
    previous.sessions = Number(previousSessionStats.sessions || 0)
    previous.bounceSessions = Number(previousSessionStats.bounceSessions || 0)
    previous.bounceRate = previous.sessions ? previous.bounceSessions / previous.sessions : 0
    previous.averageSessionSeconds = Number(previousSessionStats.averageSessionSeconds || 0)
    previous.pagesPerSession = previous.sessions ? previous.pv / previous.sessions : 0

    // 每日趋势（聚合表按日一行，前端展示补零到完整范围）
    const trendRows = database.prepare(`
      SELECT date, pv, uv, starts, validViews, completes, watchSeconds
      FROM daily_overview
      WHERE date >= ? AND date < ?
      ORDER BY date ASC
    `).all(start, end)
    const trendByDate = new Map(trendRows.map(row => [row.date, row]))
    const trend = Array.from({ length: rangeDays }, (_, index) => {
      const date = new Date(startDate.getTime() + index * dayMs).toISOString().slice(0, 10)
      const row = trendByDate.get(date) || {}
      return {
        date,
        pv: Number(row.pv || 0),
        uv: Number(row.uv || 0),
        starts: Number(row.starts || 0),
        validViews: Number(row.validViews || 0),
        completes: Number(row.completes || 0),
        watchSeconds: Number(row.watchSeconds || 0)
      }
    })

    // 视频排行（读 daily_video 聚合，不扫原始事件表）
    const topVideos = database.prepare(`
      SELECT
        v.videoId,
        COALESCE(videos.title, v.videoId) AS title,
        COALESCE(videos.author, '') AS author,
        COALESCE(videos.poster, '') AS poster,
        COALESCE(videos.isVip, 0) AS isVip,
        SUM(v.starts) AS starts,
        SUM(v.validViews) AS validViews,
        SUM(v.completes) AS completes,
        SUM(v.watchSeconds) AS watchSeconds
      FROM daily_video AS v
      LEFT JOIN videos ON videos.id = v.videoId
      WHERE v.date >= ? AND v.date < ?
      GROUP BY v.videoId
      ORDER BY validViews DESC, watchSeconds DESC
      LIMIT 10
    `).all(start, end).map(row => ({
      ...row,
      isVip: Boolean(row.isVip),
      starts: Number(row.starts || 0),
      validViews: Number(row.validViews || 0),
      completes: Number(row.completes || 0),
      watchSeconds: Number(row.watchSeconds || 0)
    }))

    const topPaths = database.prepare(`
      SELECT path, SUM(pv) AS pv, SUM(uv) AS uv
      FROM daily_path
      WHERE date >= ? AND date < ?
      GROUP BY path
      ORDER BY pv DESC
      LIMIT 10
    `).all(start, end).map(row => ({
      path: row.path || '/',
      pv: Number(row.pv || 0),
      uv: Number(row.uv || 0)
    }))

    const devices = database.prepare(`
      SELECT device, SUM(pv) AS pv, SUM(uv) AS uv
      FROM daily_device
      WHERE date >= ? AND date < ?
      GROUP BY device
      ORDER BY pv DESC
    `).all(start, end).map(row => ({
      device: row.device,
      pv: Number(row.pv || 0),
      uv: Number(row.uv || 0)
    }))

    // 地理画像：国家/地区构成（仅 ISO 国家码，不含 IP）
    const countries = database.prepare(`
      SELECT countryCode, SUM(pv) AS pv, SUM(uv) AS uv
      FROM daily_country
      WHERE date >= ? AND date < ?
      GROUP BY countryCode
      ORDER BY pv DESC
      LIMIT 20
    `).all(start, end).map(row => ({
      countryCode: row.countryCode,
      pv: Number(row.pv || 0),
      uv: Number(row.uv || 0)
    }))

    return {
      range: { days: rangeDays, startAt: `${start}T00:00:00.000Z`, endAt: `${end}T00:00:00.000Z`, timezone: 'UTC' },
      summary,
      previous,
      trend,
      funnel: {
        starts: summary.starts,
        validViews: summary.validViews,
        progress25: summary.progress25,
        progress50: summary.progress50,
        progress75: summary.progress75,
        completes: summary.completes
      },
      topVideos,
      topPaths,
      devices,
      countries
    }
  },

  getAnalyticsV1ExportData(type = 'daily', days = 7) {
    const requestedDays = Number(days)
    const rangeDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 7
    const dayMs = 24 * 60 * 60 * 1000
    const endDate = new Date()
    endDate.setUTCHours(0, 0, 0, 0)
    endDate.setUTCDate(endDate.getUTCDate() + 1)
    const startDate = new Date(endDate.getTime() - rangeDays * dayMs)
    const start = startDate.toISOString().slice(0, 10)
    const end = endDate.toISOString().slice(0, 10)

    if (type === 'videos') {
      return database.prepare(`
        SELECT v.date, v.videoId, COALESCE(videos.title, v.videoId) AS title,
          v.starts, v.validViews, v.completes, v.watchSeconds
        FROM daily_video v
        LEFT JOIN videos ON videos.id = v.videoId
        WHERE v.date >= ? AND v.date < ?
        ORDER BY v.date ASC, v.validViews DESC
      `).all(start, end)
    }
    if (type === 'paths') {
      return database.prepare(`
        SELECT date, path, pv, uv
        FROM daily_path
        WHERE date >= ? AND date < ?
        ORDER BY date ASC, pv DESC
      `).all(start, end)
    }
    if (type === 'countries') {
      return database.prepare(`
        SELECT date, countryCode, pv, uv
        FROM daily_country
        WHERE date >= ? AND date < ?
        ORDER BY date ASC, pv DESC
      `).all(start, end)
    }
    return database.prepare(`
      SELECT date, pv, uv, starts, validViews, progress25, progress50, progress75, completes, watchSeconds, validEvents, totalEvents
      FROM daily_overview
      WHERE date >= ? AND date < ?
      ORDER BY date ASC
    `).all(start, end)
  },

  recordAccess(data = {}) {
    const rawIp = data.ip || '127.0.0.1'
    const ip = String(rawIp).replace(/^::ffff:/, '').trim()
    const location = getIpLocation(ip, data.headers)
    const createdAt = new Date().toISOString()
    const action = data.action || 'PV'

    const stmt = database.prepare(`
      INSERT INTO access_logs (ip, location, userAgent, referer, path, videoId, action, deviceId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const res = stmt.run(
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

    const logId = res.lastInsertRowid

    // 异步在线查询真实 IP 地理位置并后台更新 DB 记录与 LRU 缓存 (0ms 无阻塞)
    if (logId && ip && !ipCache.has(ip) && ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
      fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json())
        .then(info => {
          if (info && info.status === 'success') {
            const parts = [info.country, info.regionName, info.city].filter(Boolean)
            const realLoc = parts.join(' ')
            if (realLoc) {
              ipCache.set(ip, realLoc)
              if (ipCache.size > 5000) {
                const firstKey = ipCache.keys().next().value
                ipCache.delete(firstKey)
              }
              try {
                database.prepare('UPDATE access_logs SET location = ? WHERE id = ?').run(realLoc, logId)
              } catch (e) { }
            }
          }
        })
        .catch(() => { })
    }

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
    // ⚠️ 数据保护（硬性要求）：清理访问日志前必须备份，保证管理端数据一条不丢
    const doClear = (clearFn) => {
      try {
        const backupPath = path.join(dataDir, `db.accesslog-backup-${Date.now()}.sqlite`)
        fs.copyFileSync(DB_SQLITE_PATH, backupPath)
        console.log(`💾 [Analytics] 访问日志清理前备份: ${backupPath}`)
        const result = clearFn()
        return { success: true, deletedCount: result.changes, backupPath }
      } catch (err) {
        console.error('❌ [Analytics] 备份失败，拒绝清理访问日志:', err.message)
        return { success: false, message: `备份失败，已中止清理: ${err.message}` }
      }
    }

    if (options.clearAll) {
      return doClear(() => database.prepare('DELETE FROM access_logs').run())
    }
    if (options.beforeDate) {
      return doClear(() => database.prepare('DELETE FROM access_logs WHERE createdAt < ?').run(options.beforeDate))
    }
    return { success: false, message: '请指定清理条件（如 beforeDate 或 clearAll）' }
  }
}

