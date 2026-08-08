const VISITOR_KEY = 'mp_visitor_id'
const SESSION_KEY = 'mp_analytics_session'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const FLUSH_INTERVAL_MS = 5000
const MAX_BATCH_SIZE = 20

const createId = (prefix) => {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return `${prefix}-${randomId}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

const getOrCreateVisitorId = () => {
  let visitorId = localStorage.getItem(VISITOR_KEY) || localStorage.getItem('mp_device_id')
  if (!visitorId) visitorId = createId('visitor')
  localStorage.setItem(VISITOR_KEY, visitorId)
  localStorage.setItem('mp_device_id', visitorId)
  return visitorId
}

const getOrCreateSessionId = () => {
  const now = Date.now()
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    if (stored?.id && now - Number(stored.lastActivityAt) < SESSION_TIMEOUT_MS) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ id: stored.id, lastActivityAt: now }))
      return stored.id
    }
  } catch {
    // Replace malformed local state with a new session.
  }

  const id = createId('session')
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastActivityAt: now }))
  return id
}

const pageViewId = createId('page')
let queue = []
let flushTimer = null
let flushPromise = null
let initialized = false

const createEvent = (eventName, payload = {}) => ({
  eventId: createId('event'),
  eventName,
  occurredAt: new Date().toISOString(),
  visitorId: getOrCreateVisitorId(),
  sessionId: getOrCreateSessionId(),
  pageViewId,
  playbackId: payload.playbackId || null,
  videoId: payload.videoId || null,
  path: window.location.pathname || '/',
  watchSeconds: payload.watchSeconds || 0,
  positionSeconds: payload.positionSeconds || 0,
  durationSeconds: payload.durationSeconds || 0,
  properties: payload.properties || {}
})

export const flushAnalytics = async ({ beacon = false } = {}) => {
  if (flushPromise || queue.length === 0) return flushPromise

  const batch = queue.splice(0, 50)
  const body = JSON.stringify({ events: batch })

  if (beacon && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(
      '/api/v1/events/batch',
      new Blob([body], { type: 'application/json' })
    )
    if (!sent) queue = [...batch, ...queue]
    return sent
  }

  flushPromise = fetch('/api/v1/events/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  })
    .then(response => {
      if (!response.ok) throw new Error(`Analytics request failed: ${response.status}`)
      return response.json()
    })
    .catch(() => {
      queue = [...batch, ...queue].slice(0, 200)
      return null
    })
    .finally(() => {
      flushPromise = null
      if (queue.length >= MAX_BATCH_SIZE) void flushAnalytics()
    })

  return flushPromise
}

export const trackEvent = (eventName, payload = {}) => {
  queue.push(createEvent(eventName, payload))
  if (queue.length >= MAX_BATCH_SIZE) void flushAnalytics()
}

const handlePageHide = () => {
  void flushAnalytics({ beacon: true })
}

export const initAnalytics = () => {
  if (initialized) return
  initialized = true
  flushTimer = window.setInterval(() => void flushAnalytics(), FLUSH_INTERVAL_MS)
  window.addEventListener('pagehide', handlePageHide)
}

export const shutdownAnalytics = () => {
  if (flushTimer) window.clearInterval(flushTimer)
  flushTimer = null
  window.removeEventListener('pagehide', handlePageHide)
  initialized = false
  void flushAnalytics({ beacon: true })
}

export const createPlaybackId = () => createId('playback')
