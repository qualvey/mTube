import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { i18n, loadInitialLocale } from './i18n'

// 明暗主题：跟随系统（mount 前设置，避免闪烁）
const applySystemTheme = () => {
  const light = window.matchMedia('(prefers-color-scheme: light)').matches
  document.documentElement.dataset.theme = light ? 'light' : 'dark'
  document.documentElement.style.colorScheme = light ? 'light' : 'dark'
}
applySystemTheme()
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applySystemTheme)

const app = createApp(App)
app.use(router)
app.use(i18n)

// 先加载语言包再挂载：避免首帧渲染时消息为空（vue-i18n 找不到 key 的告警/闪现 raw key）
// 语言包加载失败时 setAppLocale 内部已 catch，仍会正常挂载（回退英文）
loadInitialLocale().then(() => {
  app.mount('#app')
})
