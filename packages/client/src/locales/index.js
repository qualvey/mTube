// ==============================================================================
// 语言包注册表（i18n 扩展点）
// 新增语言：1) 新建 locales/<code>.json  2) 在下方注册一行即可
// 中文（zh）为源语言；en 为无匹配语言包时的兜底语言
// ==============================================================================

export const locales = {
  zh: () => import('./zh.json'),
  en: () => import('./en.json')
}

// 语言元信息（切换按钮展示、后续语言选择器用）
export const localeMeta = {
  zh: { label: '中文', short: '中' },
  en: { label: 'English', short: 'EN' }
}

export const DEFAULT_LOCALE = 'zh'
export const FALLBACK_LOCALE = 'en'
