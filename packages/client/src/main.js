import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { i18n, loadInitialLocale } from './i18n'
import { initTheme } from './services/themeService'
import { logVersion } from './services/versionService'

// 每次加载在控制台打印当前构建版本（排查线上版本用）
logVersion()

// 明暗主题：手动选择（localStorage）优先，否则按管理员默认主题（/api/v1/settings defaultTheme），mount 前初始化避免闪烁
initTheme('dark')

const app = createApp(App)
app.use(router)
app.use(i18n)

// 并行拉取管理员配置的默认主题（与语言包同批，mount 前应用 → 零闪烁）；用户手动切换过则跳过
const loadDefaultTheme = async () => {
  try {
    const res = await fetch('/api/v1/settings')
    if (res.ok) {
      const json = await res.json()
      const mode = json?.data?.defaultTheme
      if (mode && !localStorage.getItem('mp_theme')) initTheme(mode)
    }
  } catch (e) { /* 拉取失败保持默认 dark */ }
}

// 先加载语言包再挂载：避免首帧渲染时消息为空（vue-i18n 找不到 key 的告警/闪现 raw key）
// 语言包加载失败时 setAppLocale 内部已 catch，仍会正常挂载（回退英文）
Promise.all([loadInitialLocale(), loadDefaultTheme()]).then(() => {
  app.mount('#app')
})
