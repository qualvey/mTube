// ==============================================================================
// 发布策略偏好记忆（新增视频弹窗的「定时发布 / 立即发布」开关状态）
// 存储：localStorage（浏览器持久化），刷新 / 重开浏览器后保留上次选择
// 扩展点：如需按管理员隔离，改存后端设置表 + 管理员 ID，本模块接口不变
// ==============================================================================

const STORAGE_KEY = 'mp_admin_publish_pref'

/** 读取记忆的发布策略：true = 定时发布，false = 立即发布（非法值/不可用时兜底立即发布） */
export const getPublishPref = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'scheduled'
  } catch (e) {
    return false
  }
}

/** 保存发布策略偏好（隐私模式等存储不可用时静默失败，不影响功能） */
export const savePublishPref = (scheduled) => {
  try {
    localStorage.setItem(STORAGE_KEY, scheduled ? 'scheduled' : 'immediate')
  } catch (e) {
    /* ignore */
  }
}

/**
 * 定时发布默认时间：下个 UTC+8 00:00（北京时间零点）对应的本地时间戳。
 * 与后端 db.nextUtc8Midnight() 同规则：严格取「下一个」零点，当前恰为零点时取次日零点。
 * 时间戳与时区无关（UTC 基准），picker 按浏览器时区显示，语义始终是「北京时间零点」。
 * @returns {number} 毫秒时间戳
 */
export const nextUtc8MidnightTs = () => {
  const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000
  const DAY_MS = 24 * 60 * 60 * 1000
  const utc8Now = Date.now() + UTC8_OFFSET_MS
  const nextMidnightUtc8 = Math.floor(utc8Now / DAY_MS) * DAY_MS + DAY_MS
  return nextMidnightUtc8 - UTC8_OFFSET_MS
}
