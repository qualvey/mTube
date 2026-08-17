// 明暗主题：手动覆盖（localStorage）优先，否则按管理员配置的默认主题
// 默认主题来源：admin 系统设置 defaultTheme（dark/light/system），main.js mount 前拉取应用，防闪烁
import { ref } from 'vue'

const THEME_KEY = 'mp_theme'

const isDark = ref(true)
let mediaQuery = null

const apply = (dark) => {
  isDark.value = dark
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

const onSystemChange = (e) => {
  // 用户手动切换后不再随系统
  if (!localStorage.getItem(THEME_KEY)) apply(!e.matches)
}

const detachMedia = () => {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', onSystemChange)
    mediaQuery = null
  }
}

/**
 * 初始化主题（main.js mount 前调用，防闪烁）
 * @param {string} mode - 默认主题：'dark' | 'light' | 'system'（管理员配置）
 * 优先级：localStorage 手动选择 > mode 默认值
 */
export const initTheme = (mode = 'dark') => {
  detachMedia()
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') {
    apply(saved === 'dark')
    return
  }
  if (mode === 'system') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    apply(!mediaQuery.matches)
    mediaQuery.addEventListener('change', onSystemChange)
  } else {
    apply(mode === 'dark')
  }
}

/** 手动切换：写入 localStorage 固定，不再随系统/默认主题 */
export const toggleTheme = () => {
  const next = !isDark.value
  localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
  apply(next)
}

export const useTheme = () => ({ isDark, toggleTheme })
