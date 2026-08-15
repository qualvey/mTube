// 轻量日志控制器：生产默认仅输出 warn/error，开发环境全量
// 运行时开启全量调试日志：
//   - URL 加 ?debug=1
//   - 或 localStorage 设 mp_debug=1（刷新生效）
const LEVELS = { debug: 0, log: 1, info: 2, warn: 3, error: 4 }

let cachedLevel = null

const getLevel = () => {
  if (cachedLevel !== null) return cachedLevel
  let level
  try {
    if (localStorage.getItem('mp_debug') === '1') level = LEVELS.debug
  } catch { /* ignore */ }
  if (level === undefined && typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('debug')
    if (q === '1' || q === 'true') level = LEVELS.debug
  }
  if (level === undefined) level = import.meta.env.DEV ? LEVELS.debug : LEVELS.warn
  cachedLevel = level
  return level
}

export const logger = {
  debug: (...args) => { if (getLevel() <= LEVELS.debug) console.debug('[D]', ...args) },
  log: (...args) => { if (getLevel() <= LEVELS.log) console.log(...args) },
  info: (...args) => { if (getLevel() <= LEVELS.info) console.info(...args) },
  warn: (...args) => { if (getLevel() <= LEVELS.warn) console.warn(...args) },
  error: (...args) => { if (getLevel() <= LEVELS.error) console.error(...args) }
}
