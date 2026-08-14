import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { i18n, loadInitialLocale } from './i18n'

const app = createApp(App)
app.use(router)
app.use(i18n)

// 初始化语言（顺序：localStorage > navigator.language > 默认 en）
loadInitialLocale()

app.mount('#app')
