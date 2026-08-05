// ==============================================================================
// vue-i18n 实例与语言切换
// 检测规则（产品定位）：
//   1. localStorage 'mp_lang' 有用户手动选择 → 优先使用
//   2. navigator.language 以 zh 开头 → 中文
//   3. 其他环境语言：遍历语言包表，有匹配 → 使用对应语言包
//   4. 均无匹配 → 兜底英语（en）
// 语言切换后通过 window 'app-locale-changed' 事件通知各组件重拉动态内容（带 lang 参数）
// ==============================================================================
import { createI18n } from 'vue-i18n'
import { locales, localeMeta, DEFAULT_LOCALE, FALLBACK_LOCALE } from '../locales/index.js'

export const LOCALE_STORAGE_KEY = 'mp_lang'
export const LOCALE_CHANGED_EVENT = 'app-locale-changed'

export const detectLocale = () => {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (saved && locales[saved]) return saved
  } catch (e) { /* ignore */ }

  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'zh-CN') || 'zh'
  const lower = nav.toLowerCase()

  // 中文环境 → 中文
  if (lower.startsWith('zh')) return DEFAULT_LOCALE

  // 遍历语言包表找精确匹配（如 navigator.language = 'en-US' → en）
  const matched = Object.keys(locales).find((code) => lower === code || lower.startsWith(`${code}-`))
  if (matched) return matched

  // 无匹配语言包 → 兜底英语
  return FALLBACK_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detectLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages: {}
})

/**
 * 切换语言并持久化。懒加载对应语言包；切完后广播事件，让
 * 视频列表/公告/Hero/套餐等动态内容组件按新语言重新拉取。
 * @param {string} locale  - 'zh' | 'en' | 未来新增语言码
 * @param {boolean} persist - 是否写入 localStorage（默认 true）
 */
export const setAppLocale = async (locale, persist = true) => {
  if (!locales[locale]) return false

  let messages
  try {
    const mod = await locales[locale]()
    messages = mod.default || mod
  } catch (e) {
    console.error('[i18n] 语言包加载失败:', locale, e)
    return false
  }

  i18n.global.setLocaleMessage(locale, messages)
  i18n.global.locale.value = locale
  if (persist) {
    try { localStorage.setItem(LOCALE_STORAGE_KEY, locale) } catch (e) { /* ignore */ }
  }
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT, { detail: locale }))
  return true
}

/** 启动时加载当前语言包 */
export const loadInitialLocale = async () => {
  await setAppLocale(i18n.global.locale.value, false)
}

/** 当前语言码（供 videoService 等非组件模块取用） */
export const getCurrentLocale = () => i18n.global.locale.value

/** 切换按钮展示的对侧语言标签（zh 显示 EN，en 显示 中） */
export const getToggleLabel = () => {
  const current = i18n.global.locale.value
  const target = current === 'zh' ? 'en' : 'zh'
  return localeMeta[target]?.short || target.toUpperCase()
}

/** 切换语言（按钮回调） */
export const toggleLocale = async () => {
  const current = i18n.global.locale.value
  const target = current === 'zh' ? 'en' : 'zh'
  return setAppLocale(target)
}
