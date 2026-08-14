<template>
  <div
    class="w-full h-full overflow-y-auto scroll-smooth pt-14"
    ref="scrollContainer"
    @scroll="handleScroll"
  >
    <!-- Hero Section -->
    <HeroSection :blur="paywall.showPaywall" />

    <!-- Desktop Sidebar + Feed Two-Column Layout -->
    <div class="max-w-6xl mx-auto w-full flex items-start lg:gap-6">
      <CategorySidebar
        :tags="tags"
        :active-tag="activeTag"
        @select="onTagSelect"
      />
      <div class="flex-1 min-w-0">
        <!-- Video Feed Stream (Backend Controlled) -->
        <VideoFeed
          :class="{ 'blur-sm brightness-75 transition-all duration-500': paywall.showPaywall }"
          :is-vip="paywall.isVip"
          :paywall-enabled="paywall.enabled"
          :tag="activeTag"
          :tags="tags"
          @trigger-paywall="paywall.showPaywall = true"
          @tag-change="onTagSelect"
        />
      </div>
    </div>

    <!-- Scroll Transition Area (Suspense Content) -->
    <ScrollTransition :progress="scrollProgress" :blur="paywall.showPaywall" />

    <!-- Paywall Trigger Footer Section -->
    <div v-if="paywall.enabled && !paywall.isVip" class="py-16 w-full flex flex-col items-center justify-center bg-zinc-950/90 border-t border-zinc-800 text-center px-4">
      <h4 class="text-xl font-bold text-white mb-2">{{ t('app.wantMoreTitle') }}</h4>
      <p class="text-xs text-zinc-400 mb-6 max-w-xs">{{ t('app.wantMoreDesc') }}</p>
      <button
        @click="paywall.showPaywall = true"
        class="px-8 py-3.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black font-black text-sm rounded-2xl shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:scale-105 active:scale-95 transition-all"
      >
        {{ t('app.unlockNow') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, inject } from 'vue'
import { useScroll } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import HeroSection from '../components/HeroSection.vue'
import VideoFeed from '../components/VideoFeed.vue'
import CategorySidebar from '../components/CategorySidebar.vue'
import ScrollTransition from '../components/ScrollTransition.vue'
import { videoService } from '../services/videoService'

const { t } = useI18n()

// 全局付费墙状态（App 提供）：{ enabled, isVip, showPaywall }
const paywall = inject('paywall')

const scrollContainer = ref(null)
const scrollProgress = ref(0)
const lastY = ref(0)
const { y } = useScroll(scrollContainer)

// 侧边栏分类：当前标签（null = 全部）+ 标签列表
const activeTag = ref(null)
const tags = ref([])

const onTagSelect = (tag) => {
  activeTag.value = tag
}

const fetchTags = async () => {
  try {
    const result = await videoService.getTags()
    if (Array.isArray(result)) {
      tags.value = result
    }
  } catch (e) {
    console.warn('Failed to fetch tags:', e)
  }
}

onMounted(() => {
  fetchTags()
})

onUnmounted(() => {})

const handleScroll = (e) => {
  const target = e.target
  const maxScroll = target.scrollHeight - target.clientHeight
  if (maxScroll <= 0) return

  const currentY = y.value
  const progress = currentY / maxScroll
  scrollProgress.value = progress

  // Scrolling DOWN past 75% -> Trigger Paywall modal (only if not VIP)
  if (paywall.enabled && !paywall.isVip && progress > 0.75 && currentY > lastY.value && !paywall.showPaywall) {
    paywall.showPaywall = true
  }

  // Scrolling BACK UP -> Automatically hide Paywall modal to allow returning back to videos
  if (paywall.showPaywall && currentY < lastY.value && progress < 0.70) {
    paywall.showPaywall = false
  }

  lastY.value = currentY
}
</script>
