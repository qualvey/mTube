import crypto from 'node:crypto'
import { db } from '../db.js'

// ── 密码哈希：scrypt（Node 内置，零依赖）────────────────────
export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export const verifyPassword = (password, stored) => {
  const parts = String(stored || '').split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, hash] = parts
  const calc = crypto.scryptSync(String(password), salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (calc.length !== expected.length) return false
  return crypto.timingSafeEqual(calc, expected)
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

// ── 会话签发：随机 token，DB 存 hash（可吊销、重启不掉线）────
export const createUserToken = (userId) => {
  const token = 'usr_' + crypto.randomBytes(32).toString('hex')
  const ttlDays = Number(process.env.AUTH_TOKEN_TTL_DAYS) || 7
  const expiresAt = new Date(Date.now() + ttlDays * 86400000).toISOString()
  db.createSession(userId, sha256(token), expiresAt)
  return { token, expiresAt }
}

/** 登录用户信息（脱敏） */
export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  nickname: u.nickname,
  avatar: u.avatar,
  createdAt: u.createdAt
})

/** 守卫：解析 Bearer token → req.user（含 tokenHash，用于登出） */
export const requireUserAuth = (req, res, next) => {
  const auth = req.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) {
    return res.status(401).json({ code: 401, message: '请先登录' })
  }
  const session = db.findSessionByTokenHash(sha256(token))
  if (!session) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' })
  }
  if (session.status !== 'active') {
    return res.status(403).json({ code: 403, message: '账号已被禁用' })
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    db.deleteSession(session.tokenHash)
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' })
  }
  req.user = session
  next()
}
