// Modular Logger System for Backend with Configurable Debug Mode & Detailed Request/Response Interceptor

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

// Check DEBUG=true / DEBUG=1 or LOG_LEVEL env（默认 info，生产安全；本地排查用 DEBUG=true 或 LOG_LEVEL=debug）
const isDebugEnv = process.env.DEBUG === 'true' || process.env.DEBUG === '1'
let currentLevel = isDebugEnv
  ? LOG_LEVELS.debug
  : (LOG_LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LOG_LEVELS.info)

export const logger = {
  /**
   * Dynamically change log level at runtime ('debug' | 'info' | 'warn' | 'error')
   */
  setLevel(levelName) {
    if (typeof levelName === 'string' && LOG_LEVELS[levelName.toLowerCase()] !== undefined) {
      currentLevel = LOG_LEVELS[levelName.toLowerCase()]
      console.log(`\x1b[35m[LOGGER]\x1b[0m Log level updated to: \x1b[1m${levelName.toUpperCase()}\x1b[0m`)
      return true
    }
    return false
  },

  getLevel() {
    return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === currentLevel) || 'debug'
  },

  isLevelEnabled(levelName) {
    return (LOG_LEVELS[levelName] ?? 99) >= currentLevel
  },

  formatTime() {
    return new Date().toISOString()
  },

  debug(...args) {
    if (this.isLevelEnabled('debug')) {
      console.log(`\x1b[36m[DEBUG 🐞]\x1b[0m [\x1b[90m${this.formatTime()}\x1b[0m]`, ...args)
    }
  },

  info(...args) {
    if (this.isLevelEnabled('info')) {
      console.log(`\x1b[32m[INFO  ℹ️]\x1b[0m [\x1b[90m${this.formatTime()}\x1b[0m]`, ...args)
    }
  },

  warn(...args) {
    if (this.isLevelEnabled('warn')) {
      console.warn(`\x1b[33m[WARN  ⚠️]\x1b[0m [\x1b[90m${this.formatTime()}\x1b[0m]`, ...args)
    }
  },

  error(...args) {
    if (this.isLevelEnabled('error')) {
      console.error(`\x1b[31m[ERROR ❌]\x1b[0m [\x1b[90m${this.formatTime()}\x1b[0m]`, ...args)
    }
  }
}

/**
 * Express Middleware for Detailed Tracing in DEBUG Mode
 */
export const requestLoggerMiddleware = (req, res, next) => {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(2, 9)
  const contentLength = req.headers['content-length']
  const formattedLength = contentLength ? `${(Number(contentLength) / 1024 / 1024).toFixed(2)} MB` : 'N/A'
  const isCloudflare = !!(req.headers['cf-ray'] || req.headers['cf-connecting-ip'])

  if (logger.isLevelEnabled('debug')) {
    logger.debug(`┌── [REQ #${requestId}] ${req.method} ${req.originalUrl || req.url}`)
    logger.debug(`│  Client IP    : ${req.headers['cf-connecting-ip'] || req.ip || req.socket?.remoteAddress}`)
    logger.debug(`│  Proxy Engine : ${isCloudflare ? 'Cloudflare Proxy (Max 100MB per POST limit applies)' : 'Direct Nginx/VPS Connection'}`)
    logger.debug(`│  Payload Size : ${formattedLength} (${contentLength || 0} bytes)`)
    logger.debug(`│  User-Agent   : ${req.headers['user-agent'] || 'None'}`)
    
    if (req.query && Object.keys(req.query).length > 0) {
      logger.debug(`│  Query Params :`, JSON.stringify(req.query))
    }
  }

  const originalJson = res.json
  const originalSend = res.send
  let responseBody = null

  res.json = function (body) {
    responseBody = body
    return originalJson.apply(this, arguments)
  }

  res.send = function (body) {
    if (!responseBody) responseBody = body
    return originalSend.apply(this, arguments)
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime
    const status = res.statusCode

    if (status === 413) {
      logger.error(`[HTTP 413 Content Too Large] Request payload size (${formattedLength}) exceeded server/proxy body limit!`)
      if (isCloudflare) {
        logger.error(` 💡 Cloudflare Free/Pro Proxy limits single POST requests to 100MB. Direct upload or 5MB chunked upload must be used for large files.`)
      } else {
        logger.error(` 💡 Check VPS Nginx configuration for 'client_max_body_size 2000M;' in /etc/nginx/sites-enabled/`)
      }
    }

    if (logger.isLevelEnabled('debug')) {
      const statusColor = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m'
      logger.debug(`└── [RES #${requestId}] Status: ${statusColor}${status}\x1b[0m | Duration: \x1b[33m${duration}ms\x1b[0m`)
      
      if (responseBody !== null && responseBody !== undefined) {
        let bodyStr = typeof responseBody === 'object' ? JSON.stringify(responseBody) : String(responseBody)
        const maxLen = 600
        const truncated = bodyStr.length > maxLen ? bodyStr.substring(0, maxLen) + ` ... [Truncated ${bodyStr.length - maxLen} chars]` : bodyStr
        logger.debug(`   ResponseBody :`, truncated)
      }
      logger.debug(`└──────────────────────────────────────────────────────────────`)
    } else if (logger.isLevelEnabled('info')) {
      logger.info(`${req.method} ${req.originalUrl || req.url} -> ${status} (${duration}ms) [Payload: ${formattedLength}]`)
    }
  })

  next()
}
