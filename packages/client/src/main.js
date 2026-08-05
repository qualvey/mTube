import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { i18n, loadInitialLocale } from './i18n'

const app = createApp(App)
app.use(i18n)

// 异步加载当前语言包（检测规则：localStorage > navigator.language > 兜底 en）
loadInitialLocale()

app.mount('#app')
