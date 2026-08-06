import crypto from 'node:crypto'

// In-memory admin session tokens (revoked on server restart → re-login required)
const adminTokens = new Set()

export const issueAdminToken = () => {
  const token = 'adm_' + crypto.randomBytes(24).toString('hex')
  adminTokens.add(token)
  return token
}

export const revokeAdminToken = (token) => {
  adminTokens.delete(token)
}

export const requireAdminAuth = (req, res, next) => {
  const auth = req.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.get('x-admin-token') || '').trim()
  if (token && adminTokens.has(token)) {
    return next()
  }
  return res.status(401).json({ code: 401, message: '未登录或登录已过期，请重新登录' })
}

// Lock ALL /api/v1/admin/* endpoints (except login) behind an admin session token
export const adminAuthMiddleware = (req, res, next) => {
  const p = req.path
  if (p === '/login' || p === '/login/' || p === '/auth/login' || p === '/auth/login/') {
    return next()
  }
  return requireAdminAuth(req, res, next)
}
