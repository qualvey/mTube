<template>
  <div class="w-full max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">
    <!-- Stream Header -->
    <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-red-500 animate-ping"></div>
        <h3 class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
          热门视频
        </h3>
      </div>
      <div class="flex items-center gap-1 bg-zinc-800/80 p-1 rounded-xl border border-zinc-700/50 text-xs">
        <button 
          v-for="filter in filters" 
          :key="filter.key"
          @click="activeFilter = filter.key"
          class="px-2.5 py-1 rounded-lg font-medium transition-all"
          :class="activeFilter === filter.key ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-bold shadow' : 'text-zinc-400 hover:text-white'"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <!-- Skeleton Loaders -->
    <div v-if="loading" class="flex flex-col gap-6">
      <div v-for="n in 2" :key="n" class="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 animate-pulse">
        <div class="w-full aspect-video bg-zinc-800 rounded-xl"></div>
        <div class="h-4 bg-zinc-800 rounded w-3/4"></div>
        <div class="h-3 bg-zinc-800/60 rounded w-1/2"></div>
        <div class="flex items-center justify-between pt-2">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-zinc-800"></div>
            <div class="h-3 bg-zinc-800 rounded w-20"></div>
          </div>
          <div class="h-6 bg-zinc-800 rounded w-16"></div>
        </div>
      </div>
    </div>

    <!-- Video Feed List -->
    <div v-else class="flex flex-col gap-6">
      <VideoCard
        v-for="video in filteredVideos"
        :key="video.id"
        :video="video"
        :is-vip-unlocked="isVip"
        :active="activeVideoId === video.id"
        @trigger-paywall="$emit('trigger-paywall', $event)"
        @request-activate="onRequestActivate"
        @request-pause="onRequestPause"
      />

      <!-- End of Feed Indicator -->
      <div class="text-center py-6 text-zinc-500 text-xs flex flex-col items-center gap-2 border-t border-zinc-800/60 mt-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-zinc-600">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <span>已加载全部免费体验视频</span>
        <button 
          @click="$emit('trigger-paywall')" 
          class="mt-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-black font-extrabold text-xs rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all"
        >
          开通 VIP 解锁全部 5000+ 原画库
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import VideoCard from './VideoCard.vue'
import { videoService } from '../services/videoService'

defineEmits(['trigger-paywall'])

const props = defineProps({
  isVip: {
    type: Boolean,
    default: false
  }
})

const loading = ref(true)
const videos = ref([])
const activeFilter = ref('all')

/** 当前激活（拉流/播放）的视频 ID，同一时间只允许一个 */
const activeVideoId = ref(null)

const filters = [
  { key: 'all', label: '推荐' },
  { key: 'vip', label: 'VIP独家' },
  { key: 'free', label: '免费试看' }
]

onMounted(async () => {
  try {
    videos.value = await videoService.getVideos()
    // 默认激活第一个视频开始拉流
    if (videos.value.length > 0) {
      activeVideoId.value = videos.value[0].id
    }
  } finally {
    loading.value = false
  }
})

const filteredVideos = computed(() => {
  if (activeFilter.value === 'vip') {
    return videos.value.filter(v => v.isVip)
  }
  if (activeFilter.value === 'free') {
    return videos.value.filter(v => !v.isVip)
  }
  return videos.value
})

/**
 * 某个视频请求成为唯一激活视频（用户点击播放或进入视口中心时触发）
 */
const onRequestActivate = (videoId) => {
  if (activeVideoId.value !== videoId) {
    activeVideoId.value = videoId
  }
}

/**
 * 某个视频离开视口中心 → 清除 activeVideoId 触发 pause
 */
const onRequestPause = (videoId) => {
  if (activeVideoId.value === videoId) {
    activeVideoId.value = null
  }
}
</script>
