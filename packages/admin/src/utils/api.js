// ==============================================================================
// Admin API helper: automatically attaches the admin session token to every
// request and redirects to /login when the token is rejected (401).
// ==============================================================================

const TOKEN_KEY = 'adminToken'

export const getAdminToken = () => localStorage.getItem(TOKEN_KEY)

export const setAdminToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export const clearAdminSession = () => {
  localStorage.removeItem('isLoggedIn')
  localStorage.removeItem(TOKEN_KEY)
}

export const apiFetch = (url, options = {}) => {
  const headers = { ...(options.headers || {}) }
  const token = getAdminToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(url, { ...options, headers }).then(async (resp) => {
    if (resp.status === 401) {
      clearAdminSession()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      throw new Error('登录已过期，请重新登录')
    }
    return resp
  })
}
