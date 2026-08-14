// User auth API & token storage
const TOKEN_KEY = 'mp_user_token'

const api = async (url, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data: json }
  } catch (e) {
    console.warn('Auth request failed:', e)
    return { ok: false, status: 0, data: null }
  }
}

export const authService = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (t) => {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  },

  async register({ email, password, nickname }) {
    const r = await api('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, nickname })
    })
    if (r.ok && r.data?.data?.token) {
      this.setToken(r.data.data.token)
      return { ok: true, user: r.data.data.user, message: r.data.message }
    }
    return { ok: false, message: r.data?.message || '注册失败' }
  },

  async login({ email, password }) {
    const r = await api('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    if (r.ok && r.data?.data?.token) {
      this.setToken(r.data.data.token)
      return { ok: true, user: r.data.data.user, message: r.data.message }
    }
    return { ok: false, message: r.data?.message || '登录失败' }
  },

  async logout() {
    if (this.getToken()) {
      await api('/api/v1/auth/logout', { method: 'POST' })
    }
    this.setToken(null)
  },

  async getMe() {
    if (!this.getToken()) return null
    const r = await api('/api/v1/auth/me')
    if (r.ok && r.data?.data) return r.data.data
    if (r.status === 401) this.setToken(null)
    return null
  }
}
