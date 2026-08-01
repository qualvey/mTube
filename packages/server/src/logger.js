// Modular Logger System for Backend with configurable Log Levels & Detail Request/Response Interceptor

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

// Default Log Level from environment variable LOG_LEVEL (defaults to 'debug')
let currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL || 'debug').toLowerCase()] ?? LOG_LEVELS.debug

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

  /**
   * Get current log level string
   */
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
      console.log(`\x1b[36m[DEBUG]\x1b[0m [\x1b[90m${this.formatTime()}\x1b[0m]`, ...args)
    }
  },

  info(...args) {
    if (this.isLevelEnabled('info')) {
      console.log(`\x1b[32m[INFO]\x1b[0m  [\x1b[90m${this.formatTime()}\x1b[0m]`, ...args)
    }
  },

  warn(...args) {
    if (this.isLevelEnabled('warn')) {
      console.warn(`\x1b[33m[WARN]\x1b[0m  [\x1b[90m${this.formatTime()}\x1b[0m]`, ...args)
    }
  },

  error(...args) {
    if (this.isLevelEnabled('error')) {
      console.error(`\x1b[31m[ERROR]\x1b[0m [\x1b[90m${this.formatTime()}\x1b[0m]`, ...args)
    }
  }
}

/**
 * Express Middleware for Request & Response Detail Tracing in DEBUG Mode
 */
export const requestLoggerMiddleware = (req, res, next) => {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(2, 9)

  // Log Request Details in DEBUG mode
  if (logger.isLevelEnabled('debug')) {
    logger.debug(`┌── [REQ #${requestId}] ${req.method} ${req.originalUrl || req.url}`)
    logger.debug(`│  Client IP : ${req.ip || req.socket?.remoteAddress}`)
    logger.debug(`│  Headers   :`, JSON.stringify(req.headers, null, 2))
    
    if (req.query && Object.keys(req.query).length > 0) {
      logger.debug(`│  Query     :`, JSON.stringify(req.query, null, 2))
    }
    if (req.body && Object.keys(req.body).length > 0) {
      logger.debug(`│  Body      :`, JSON.stringify(req.body, null, 2))
    }
  }

  // Intercept Response to log payload details
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

    if (logger.isLevelEnabled('debug')) {
      const statusColor = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m'
      logger.debug(`└── [RES #${requestId}] Status: ${statusColor}${status}\x1b[0m | Duration: \x1b[33m${duration}ms\x1b[0m`)
      
      if (responseBody !== null && responseBody !== undefined) {
        let bodyStr = ''
        if (typeof responseBody === 'object') {
          try {
            bodyStr = JSON.stringify(responseBody, null, 2)
          } catch {
            bodyStr = String(responseBody)
          }
        } else {
          bodyStr = String(responseBody)
        }

        // Truncate ultra-large responses (e.g. M3U8 content or stream buffers) for clean console reading
        const maxLen = 800
        const truncated = bodyStr.length > maxLen ? bodyStr.substring(0, maxLen) + `\n... [Truncated ${bodyStr.length - maxLen} chars]` : bodyStr
        logger.debug(`   Payload   :`, truncated)
      }
      logger.debug(`└──────────────────────────────────────────────────────────────`)
    } else if (logger.isLevelEnabled('info')) {
      logger.info(`${req.method} ${req.originalUrl || req.url} -> ${status} (${duration}ms)`)
    }
  })

  next()
}
