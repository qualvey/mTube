import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { i18n, loadInitialLocale } from './i18n'
import { initTheme } from './services/themeService'

// 明暗主题：跟随系统（手动选择优先），mount 前初始化避免闪烁
initTheme()

const app = createApp(App)
app.use(router)
app.use(i18n)

// 先加载语言包再挂载：避免首帧渲染时消息为空（vue-i18n 找不到 key 的告警/闪现 raw key）
// 语言包加载失败时 setAppLocale 内部已 catch，仍会正常挂载（回退英文）
loadInitialLocale().then(() => {
  app.mount('#app')
})
