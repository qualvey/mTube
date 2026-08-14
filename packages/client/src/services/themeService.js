// 明暗主题：跟随系统 + 手动覆盖（localStorage）
import { ref } from 'vue'

const THEME_KEY = 'mp_theme'

const isDark = ref(true)
let mediaQuery = null

const apply = (dark) => {
  isDark.value = dark
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

/** 初始化：手动选择优先，否则跟随系统（main.js mount 前调用，防闪烁） */
export const initTheme = () => {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') {
    apply(saved === 'dark')
    return
  }
  mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
  apply(!mediaQuery.matches)
  mediaQuery.addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) apply(!e.matches)
  })
}

/** 手动切换：写入 localStorage 固定，不再随系统 */
export const toggleTheme = () => {
  const next = !isDark.value
  localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
  apply(next)
}

export const useTheme = () => ({ isDark, toggleTheme })
