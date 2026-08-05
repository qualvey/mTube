<template>
  <div 
    ref="cardRef"
    class="relative w-full rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-2xl transition-all duration-300 hover:border-zinc-700/80"
  >
    <!-- Video Player Area -->
    <div class="relative w-full bg-black group overflow-hidden flex items-center justify-center min-h-[220px]">
      <!-- Memory Stream Video Player (Fetch with custom headers -> Blob Object URL -> Plyr) -->
      <MemoryVideoPlayer
        v-if="!video.isVip || isVipUnlocked || !isTrialEnded"
        :video="video"
        :muted="isMuted"
        :is-vip-unlocked="isVipUnlocked"
        :active="active"
        @trial-ended="handleTrialEnded"
        @request-activate="$emit('request-activate', video.id)"
      />

      <!-- VIP Locked Overlay when trial ended -->
      <div 
        v-else-if="video.isVip && !isVipUnlocked && isTrialEnded" 
        class="absolute inset-0 z-20 bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center cursor-pointer"
        @click="onVipClick"
      >
        <div class="w-14 h-14 rounded-full bg-yellow-500/20 border border-yellow-500/50 flex items-center justify-center mb-3 shadow-[0_0_25px_rgba(234,179,8,0.4)] animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7 text-yellow-400">
            <path fill-rule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clip-rule="evenodd" />
          </svg>
        </div>
        <p class="text-white text-base font-bold drop-shadow">试看时长已结束 ({{ Math.round((video.previewDuration || 120) / 60) }}分钟)</p>
        <p class="text-xs text-zinc-400 mt-1 mb-4">解锁 VIP 尊享无限制观看全片与全部 4K 原画库</p>
        <button 
          class="px-5 py-2 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-black text-xs font-black rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
        >
          立即解锁尊享 VIP 特权
        </button>
      </div>

      <!-- VIP Badge (Top Left Overlay) -->
      <div 
        v-if="video.isVip && !isVipUnlocked" 
        class="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-black text-xs font-black shadow-lg flex items-center gap-1 pointer-events-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5">
          <path fill-rule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clip-rule="evenodd" />
        </svg>
        <span>VIP 试看 {{ Math.round((video.previewDuration || 120) / 60) }}分钟</span>
      </div>
      <div 
        v-else-if="video.isVip && isVipUnlocked" 
        class="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-full bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-black text-xs font-black shadow-lg flex items-center gap-1 pointer-events-none"
      >
        <span>👑 VIP 尊享解禁</span>
      </div>

      <!-- Duration Badge (Top Right Overlay) -->
      <div class="absolute top-3 right-3 z-30 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-white text-[11px] font-mono border border-white/10 pointer-events-none">
        {{ video.duration }}
      </div>
    </div>

    <!-- Video Info & Meta Area -->
    <div class="p-4 flex flex-col gap-3">
      <div>
        <div class="flex items-center gap-2 mb-1.5 flex-wrap">
          <span 
            v-for="tag in (typeof video.tags === 'string' ? JSON.parse(video.tags) : video.tags)" 
            :key="tag"
            class="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] font-medium rounded-md border border-zinc-700/50"
          >
            #{{ tag }}
          </span>
        </div>
        <h4 class="text-base font-bold text-white leading-snug line-clamp-2">
          {{ video.title }}
        </h4>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-zinc-800/80">
        <div class="flex items-center gap-2.5">
          <img 
            :src="video.authorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop'" 
            class="w-8 h-8 rounded-full object-cover border border-zinc-700 shadow-sm"
          />
          <div class="flex flex-col">
            <span class="text-xs font-bold text-zinc-200">{{ video.author }}</span>
            <span class="text-[10px] text-zinc-500">官方认证创作者</span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button 
            @click="handleLike" 
            class="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 transition-colors"
            :class="{ 'text-red-500': isLiked }"
          >
            <svg xmlns="http://www.w3.org/2000/svg" :fill="isLiked ? 'currentColor' : 'none'" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            <span>{{ formatCount(likesCount) }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

import MemoryVideoPlayer from './MemoryVideoPlayer.vue'
import { trackAnalytics } from '../services/videoService'

const props = defineProps({
  video: {
    type: Object,
    required: true
  },
  isVipUnlocked: {
    type: Boolean,
    default: false
  },
  /** 是否为当前激活（拉流/播放）的视频 */
  active: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['trigger-paywall', 'request-activate', 'request-pause'])

const isMuted = ref(true)
const isLiked = ref(props.video.isLiked)
const likesCount = ref(props.video.likes)
const isTrialEnded = ref(false)

const onVipClick = () => {
  trackAnalytics('VIDEO_CLICK', props.video.id)
  emit('trigger-paywall', props.video)
}

const handleTrialEnded = () => {
  if (!props.isVipUnlocked) {
    isTrialEnded.value = true
    trackAnalytics('VIDEO_CLICK', props.video.id)
    emit('trigger-paywall', props.video)
  }
}


const handleLike = () => {
  isLiked.value = !isLiked.value
  likesCount.value += isLiked.value ? 1 : -1
}

const formatCount = (count) => {
  if (count >= 10000) {
    return (count / 10000).toFixed(1) + 'w'
  }
  return count
}

// ── IntersectionObserver — YouTube 式自动激活逻辑 ────────────────────────────
// 当卡片进入视口中心区域时，自动 emit request-activate 让 VideoFeed 切换活跃视频
const cardRef = ref(null)
let intersectionObserver = null

onMounted(() => {
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.isIntersecting) {
        // 进入视口中心区域 → 激活并播放
        emit('request-activate', props.video.id)
      } else {
        // 离开视口中心区域 → 暂停
        emit('request-pause', props.video.id)
      }
    },
    {
      // rootMargin 分别从上/下将视口缩小，只有位于中心区域的卡片才会触发
      // 偏上（-20%）是因为向下滚动时卡片先出现在下半屏
      rootMargin: '-20% 0px -30% 0px',
      threshold: 0
    }
  )
  if (cardRef.value) {
    intersectionObserver.observe(cardRef.value)
  }
})

onUnmounted(() => {
  if (intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver = null
  }
})
</script>
