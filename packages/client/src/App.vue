<template>
  <div class="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
    <!-- Header Navbar -->
    <header class="fixed top-0 inset-x-0 z-30 px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent backdrop-blur-md border-b border-white/5 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-red-600 to-yellow-500 flex items-center justify-center font-black text-black text-sm shadow-md">
          ▶
        </div>
        <span class="font-extrabold text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-300">
          StreamVIP
        </span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Language Switcher (Top Right) -->
        <button
          @click="handleToggleLang"
          class="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-black rounded-full backdrop-blur-md transition-all active:scale-95"
        >
          {{ langToggleLabel }}
        </button>
        <button 
          v-if="!isVip"
          @click="showPaywall = true" 
          class="px-3.5 py-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-black rounded-full shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:scale-105 active:scale-95 transition-all"
        >
          {{ t('app.openVip') }}
        </button>
        <div 
          v-else 
          class="px-3 py-1 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold rounded-full flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.15)]"
        >
          <span>👑</span>
          <span>{{ t('app.vipMember') }}</span>
        </div>
      </div>
    </header>

    <!-- Main Scrollable Area (Allows unrestricted scrolling & returning back up) -->
    <div 
      class="w-full h-full overflow-y-auto scroll-smooth pt-14"
      ref="scrollContainer"
      @scroll="handleScroll"
    >
      <!-- Hero Section -->
      <HeroSection :blur="showPaywall" />
      
      <!-- Video Feed Stream (Backend Controlled) -->
      <VideoFeed 
        :class="{ 'blur-sm brightness-75 transition-all duration-500': showPaywall }" 
        :is-vip="isVip"
        @trigger-paywall="showPaywall = true"
      />
      
      <!-- Scroll Transition Area (Suspense Content) -->
      <ScrollTransition :progress="scrollProgress" :blur="showPaywall" />
      
      <!-- Paywall Trigger Footer Section -->
      <div v-if="!isVip" class="py-16 w-full flex flex-col items-center justify-center bg-zinc-950/90 border-t border-zinc-800 text-center px-4">
        <h4 class="text-xl font-bold text-white mb-2">{{ t('app.wantMoreTitle') }}</h4>
        <p class="text-xs text-zinc-400 mb-6 max-w-xs">{{ t('app.wantMoreDesc') }}</p>
        <button 
          @click="showPaywall = true" 
          class="px-8 py-3.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black font-black text-sm rounded-2xl shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:scale-105 active:scale-95 transition-all"
        >
          {{ t('app.unlockNow') }}
        </button>
      </div>
    </div>

    <!-- Modals Overlay -->
    <Transition name="fade">
      <NoticeModal v-if="showNotice" :title="noticeTitle" :content="noticeContent" @close="showNotice = false" />
    </Transition>

    <Transition name="fade">
      <AgeGateModal v-if="!ageVerified" @verified="onAgeVerified" />
    </Transition>

    <Transition name="slide-up">
      <PaywallModal v-if="showPaywall" @close="showPaywall = false" @vip-unlocked="onVipUnlocked" />
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useScroll } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import AgeGateModal from './components/AgeGateModal.vue'
import NoticeModal from './components/NoticeModal.vue'
import HeroSection from './components/HeroSection.vue'
import VideoFeed from './components/VideoFeed.vue'
import ScrollTransition from './components/ScrollTransition.vue'
import PaywallModal from './components/PaywallModal.vue'
import { trackAnalytics } from './services/videoService'
import { getCurrentLocale, getToggleLabel, toggleLocale, LOCALE_CHANGED_EVENT } from './i18n'

const { t } = useI18n()

const langToggleLabel = ref(getToggleLabel())

const handleToggleLang = async () => {
  await toggleLocale()
  langToggleLabel.value = getToggleLabel()
}

const scrollContainer = ref(null)

const ageVerified = ref(false)
const showPaywall = ref(false)
const isVip = ref(false)

const showNotice = ref(false)
const noticeTitle = ref('📢 官方重要公告')
const noticeContent = ref('')

// Track scroll position using vueuse
const { y } = useScroll(scrollContainer)
const scrollProgress = ref(0)
const lastY = ref(0)

const getOrCreateDeviceId = () => {
  let id = localStorage.getItem('mp_device_id')
  if (!id) {
    id = 'dev-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36)
    localStorage.setItem('mp_device_id', id)
  }
  return id
}

const checkVipStatus = async () => {
  const deviceId = getOrCreateDeviceId()
  try {
    const res = await fetch(`/api/v1/paywall/vip-status?deviceId=${deviceId}`)
    if (res.ok) {
      const json = await res.json()
      if (json && json.data && typeof json.data.isVip === 'boolean') {
        isVip.value = json.data.isVip
      }
    }
  } catch (e) {
    console.warn('Failed to fetch VIP status:', e)
  }
}

const onVipUnlocked = () => {
  isVip.value = true
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
  // Dynamically set HTML Document Title from backend B-side configuration
  fetchSiteConfig()

  // Trigger PV Analytics Tracking
  trackAnalytics('PV')


  const verified = localStorage.getItem('age_verified_18')

  if (verified === 'true') {
    ageVerified.value = true
  }

  // Check initial VIP status
  await checkVipStatus()

  // Explicitly pull notice from backend REST API GET /api/v1/notice
  fetchNotice()

  window.addEventListener(LOCALE_CHANGED_EVENT, onLocaleChanged)
})

onUnmounted(() => {
  window.removeEventListener(LOCALE_CHANGED_EVENT, onLocaleChanged)
})

const onAgeVerified = () => {
  ageVerified.value = true
  localStorage.setItem('age_verified_18', 'true')
}

const handleScroll = (e) => {
  if (!ageVerified.value) return
  
  const target = e.target
  const maxScroll = target.scrollHeight - target.clientHeight
  if (maxScroll <= 0) return
  
  const currentY = y.value
  const progress = currentY / maxScroll
  scrollProgress.value = progress

  // Scrolling DOWN past 75% -> Trigger Paywall modal (only if not VIP)
  if (!isVip.value && progress > 0.75 && currentY > lastY.value && !showPaywall.value) {
    showPaywall.value = true
  }

  // Scrolling BACK UP -> Automatically hide Paywall modal to allow returning back to videos
  if (showPaywall.value && currentY < lastY.value && progress < 0.70) {
    showPaywall.value = false
  }

  lastY.value = currentY
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
