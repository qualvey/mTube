// 版本检测服务：轮询 /api/v1/version，发现与本地构建版本不一致时置 outdated
// 前端据此提示「发现新版本 → 一键刷新」，避免用户手动清缓存
import { reactive } from 'vue'

// 构建时注入（vite define，见 vite.config.js / Dockerfile ARG GIT_SHA）
const APP_SHA = typeof __APP_GIT_SHA__ !== 'undefined' ? __APP_GIT_SHA__ : 'dev'
const APP_BUILD_TIME = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : ''

const CHECK_INTERVAL = 5 * 60 * 1000 // 5 分钟轮询一次

const state = reactive({
  currentSha: APP_SHA,
  currentBuildTime: APP_BUILD_TIME,
  latestSha: null,
  latestVersion: null,
  outdated: false, // 发现新版本，需要提示刷新
  checking: false,
})

async function checkVersion() {
  if (state.checking) return
  state.checking = true
  try {
    const res = await fetch('/api/v1/version', { cache: 'no-store' })
    if (!res.ok) return
    const json = await res.json()
    const data = json?.data
    if (!data?.gitSha) return
    state.latestSha = data.gitSha
    state.latestVersion = data.version || null
    // dev 模式（本地开发）不提示；只有生产构建才对比
    state.outdated = APP_SHA !== 'dev' && data.gitSha !== APP_SHA
  } catch (e) {
    // 网络异常静默，下次轮询再试
  } finally {
    state.checking = false
  }
}

let timer = null

export function startVersionCheck() {
  if (typeof window === 'undefined') return
  checkVersion() // 立即检查一次
  timer = setInterval(checkVersion, CHECK_INTERVAL)
  // 用户切回页面时立即复查，缩短感知延迟
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkVersion()
  })
}

export function stopVersionCheck() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function useVersion() {
  return state
}
