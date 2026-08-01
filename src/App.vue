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
      <button 
        @click="showPaywall = true" 
        class="px-3.5 py-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-black rounded-full shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:scale-105 active:scale-95 transition-all"
      >
        开通 VIP
      </button>
    </header>

    <!-- Main Scrollable Area -->
    <div 
      class="w-full h-full overflow-y-auto scroll-smooth pt-14"
      ref="scrollContainer"
      @scroll="handleScroll"
    >
      <!-- Hero Section -->
      <HeroSection :blur="showPaywall" />
      
      <!-- Video Feed Stream (Backend Controlled) -->
      <VideoFeed 
        :class="{ 'blur-md brightness-50 pointer-events-none transition-all duration-500': showPaywall }" 
        @trigger-paywall="onTriggerPaywall"
      />
      
      <!-- Scroll Transition Area (Suspense Content) -->
      <ScrollTransition :progress="scrollProgress" :blur="showPaywall" />
      
      <!-- Paywall Trigger Footer Section -->
      <div class="py-16 w-full flex flex-col items-center justify-center bg-zinc-950/90 border-t border-zinc-800 text-center px-4">
        <h4 class="text-xl font-bold text-white mb-2">想看更多无删减高清视频？</h4>
        <p class="text-xs text-zinc-400 mb-6 max-w-xs">解禁全部 100,000+ 专属超清音视频库，无广告，随心看。</p>
        <button 
          @click="showPaywall = true" 
          class="px-8 py-3.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black font-black text-sm rounded-2xl shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:scale-105 active:scale-95 transition-all"
        >
          立即解锁尊享 VIP 特权
        </button>
      </div>
    </div>

    <!-- Modals Overlay -->
    <Transition name="fade">
      <AgeGateModal v-if="!ageVerified" @verified="onAgeVerified" />
    </Transition>

    <Transition name="slide-up">
      <PaywallModal v-if="showPaywall" @close="onClosePaywall" />
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useScroll } from '@vueuse/core'
import AgeGateModal from './components/AgeGateModal.vue'
import HeroSection from './components/HeroSection.vue'
import VideoFeed from './components/VideoFeed.vue'
import ScrollTransition from './components/ScrollTransition.vue'
import PaywallModal from './components/PaywallModal.vue'
import { trackAnalytics } from './services/videoService'

const scrollContainer = ref(null)
const ageVerified = ref(false)
const showPaywall = ref(false)

// Use vueuse to track scroll
const { y } = useScroll(scrollContainer)
const scrollProgress = ref(0)

onMounted(() => {
  // Trigger PageView analytics on visit
  trackAnalytics('PV')

  // Check localStorage for age verification
  const verified = localStorage.getItem('age_verified_18')
  if (verified === 'true') {
    ageVerified.value = true
  }
})


const onAgeVerified = () => {
  ageVerified.value = true
  localStorage.setItem('age_verified_18', 'true')
}

const onTriggerPaywall = () => {
  showPaywall.value = true
  if (scrollContainer.value) {
    scrollContainer.value.style.overflowY = 'hidden'
  }
}

const onClosePaywall = () => {
  showPaywall.value = false
  if (scrollContainer.value) {
    scrollContainer.value.style.overflowY = 'auto'
  }
}

// Watch scroll position to trigger animations and paywall
const handleScroll = (e) => {
  if (!ageVerified.value) return // Don't allow scrolling effects if not verified
  
  const target = e.target
  const maxScroll = target.scrollHeight - target.clientHeight
  if (maxScroll <= 0) return
  
  const progress = y.value / maxScroll
  scrollProgress.value = progress

  // Trigger paywall when scrolled past 75%
  if (progress > 0.75 && !showPaywall.value) {
    onTriggerPaywall()
  }
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
