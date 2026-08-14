<template>
  <div class="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
    <!-- Header Navbar -->
    <header class="fixed top-0 inset-x-0 z-30 px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent backdrop-blur-md border-b border-white/5 flex items-center justify-between">
      <router-link to="/" class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-red-600 to-yellow-500 flex items-center justify-center font-black text-black text-sm shadow-md">
          ▶
        </div>
        <span class="font-extrabold text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-300">
          StreamVIP
        </span>
      </router-link>
      <div class="flex items-center gap-2">
        <!-- Language Switcher (Top Right) -->
        <button
          @click="handleToggleLang"
          class="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-black rounded-full backdrop-blur-md transition-all active:scale-95"
        >
          {{ langToggleLabel }}
        </button>
        <button 
          v-if="paywall.enabled && !paywall.isVip"
          @click="paywall.showPaywall = true" 
          class="px-3.5 py-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-black rounded-full shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:scale-105 active:scale-95 transition-all"
        >
          {{ t('app.openVip') }}
        </button>
        <div 
          v-else-if="paywall.enabled && paywall.isVip" 
          class="px-3 py-1 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold rounded-full flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.15)]"
        >
          <span>👑</span>
          <span>{{ t('app.vipMember') }}</span>
        </div>
      </div>
    </header>

    <!-- Router View: Home / Video Detail -->
    <router-view
      v-slot="{ Component }"
      @trigger-paywall="paywall.showPaywall = true"
    >
      <component :is="Component" @trigger-paywall="paywall.showPaywall = true" />
    </router-view>

    <!-- Modals Overlay -->
    <Transition name="fade">
      <NoticeModal v-if="showNotice" :title="noticeTitle" :content="noticeContent" @close="showNotice = false" />
    </Transition>

    <Transition name="fade">
      <AgeGateModal v-if="!ageVerified" @verified="onAgeVerified" />
    </Transition>

    <Transition name="slide-up">
      <PaywallModal v-if="paywall.showPaywall" @close="paywall.showPaywall = false" @vip-unlocked="onVipUnlocked" />
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, provide, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AgeGateModal from './components/AgeGateModal.vue'
import NoticeModal from './components/NoticeModal.vue'
import PaywallModal from './components/PaywallModal.vue'
import { trackAnalytics } from './services/videoService'
import { initAnalytics, shutdownAnalytics } from './services/analyticsService'
import { getCurrentLocale, getToggleLabel, toggleLocale, LOCALE_CHANGED_EVENT } from './i18n'

const { t } = useI18n()

const langToggleLabel = ref(getToggleLabel())

const handleToggleLang = async () => {
  await toggleLocale()
  langToggleLabel.value = getToggleLabel()
}

const ageVerified = ref(false)
const showNotice = ref(false)
const noticeTitle = ref('📢 官方重要公告')
const noticeContent = ref('')

/**
 * 全局状态：付费墙开关（管理员控制）+ 当前 VIP 状态 + 付费墙弹窗显隐。
 * 通过 provide/inject 共享给 HomeView / VideoDetailView。
 */
const paywall = reactive({
  enabled: false,    // 收费模式全局开关（/api/v1/settings）
  isVip: false,      // 当前设备是否 VIP（免费模式下恒 true）
  showPaywall: false
})
provide('paywall', paywall)

const getOrCreateDeviceId = () => {
  let id = localStorage.getItem('mp_device_id')
  if (!id) {
    id = 'dev-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36)
    localStorage.setItem('mp_device_id', id)
  }
  return id
}

const checkVipStatus = async () => {
  // 收费模式关闭时无需校验 VIP，全站免费
  if (!paywall.enabled) return
  const deviceId = getOrCreateDeviceId()
  try {
    const res = await fetch(`/api/v1/paywall/vip-status?deviceId=${deviceId}`)
    if (res.ok) {
      const json = await res.json()
      if (json && json.data && typeof json.data.isVip === 'boolean') {
        paywall.isVip = json.data.isVip
      }
    }
  } catch (e) {
    console.warn('Failed to fetch VIP status:', e)
  }
}

/**
 * 拉取收费模式开关。关闭时：全站免费（isVip 恒 true，VIP 相关 UI/弹窗/试看全部不生效）
 */
const fetchPaywallMode = async () => {
  try {
    const res = await fetch('/api/v1/settings')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data && typeof json.data.paywallEnabled === 'boolean') {
        paywall.enabled = json.data.paywallEnabled
        if (!json.data.paywallEnabled) {
          paywall.isVip = true // 免费模式下所有内容可看
        }
      }
    }
  } catch (e) {
    console.warn('Failed to fetch paywall mode:', e)
  }
}

const onVipUnlocked = () => {
  paywall.isVip = true
}

const getNoticeHash = (title, content) => {
  const str = (title || '') + '|' + (content || '')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return 'nh_' + Math.abs(hash).toString(36)
}

const fetchSiteConfig = async () => {
  try {
    const lang = getCurrentLocale()
    const res = await fetch(`/api/v1/site-config?lang=${lang}`)
    if (res.ok) {
      const json = await res.json()
      if (json && json.data && json.data.siteTitle) {
        document.title = json.data.siteTitle
      }
    }
  } catch (e) {}
}

// 语言切换后重拉动态内容（site-config / notice）
const onLocaleChanged = () => {
  fetchSiteConfig()
  fetchNotice()
}

const fetchNotice = async () => {
  try {
    const lang = getCurrentLocale()
    const res = await fetch(`/api/v1/notice?lang=${lang}`)
    if (res.ok) {
      const json = await res.json()
      if (json && json.data && json.data.enableNotice) {
        const title = json.data.noticeTitle || '📢 官方重要公告'
        const content = json.data.noticeContent || ''
        const serverHash = json.data.hash

        const todayStr = new Date().toISOString().substring(0, 10)
        const dismissedDate = localStorage.getItem('mp_notice_dismissed_date')
        const dismissedHash = localStorage.getItem('mp_notice_dismissed_hash')

        // Re-display modal if date passed OR if notice content/title hash changed!
        if (dismissedDate !== todayStr || dismissedHash !== serverHash) {
          noticeTitle.value = title
          noticeContent.value = content
          showNotice.value = true
        }
      }
    }
  } catch (e) {
    console.warn('Failed to pull notice from backend API:', e)
  }
}

onMounted(async () => {
  initAnalytics()

  // Dynamically set HTML Document Title from backend B-side configuration
  fetchSiteConfig()

  // Trigger PV Analytics Tracking
  trackAnalytics('PV')

  const verified = localStorage.getItem('age_verified_18')

  if (verified === 'true') {
    ageVerified.value = true
  }

  // Check initial VIP status
  await fetchPaywallMode()
  await checkVipStatus()

  // Explicitly pull notice from backend REST API GET /api/v1/notice
  fetchNotice()

  window.addEventListener(LOCALE_CHANGED_EVENT, onLocaleChanged)
})

onUnmounted(() => {
  window.removeEventListener(LOCALE_CHANGED_EVENT, onLocaleChanged)
  shutdownAnalytics()
})

const onAgeVerified = () => {
  ageVerified.value = true
  localStorage.setItem('age_verified_18', 'true')
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
