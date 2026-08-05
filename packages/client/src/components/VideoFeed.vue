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
          @click="onFilterChange(filter.key)"
          class="px-2.5 py-1 rounded-lg font-medium transition-all"
          :class="activeFilter === filter.key ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-bold shadow' : 'text-zinc-400 hover:text-white'"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <!-- Skeleton Loaders (first page) -->
    <div v-if="loading" class="flex flex-col gap-6">
      <div v-for="n in 3" :key="n" class="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 animate-pulse">
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
        v-for="video in videos"
        :key="video.id"
        :video="video"
        :is-vip-unlocked="isVip"
        :active="activeVideoId === video.id"
        @trigger-paywall="$emit('trigger-paywall', $event)"
        @request-activate="onRequestActivate"
        @request-pause="onRequestPause"
      />

      <!-- Infinite Scroll Sentinel + Loading More Indicator -->
      <div ref="sentinelRef" class="flex flex-col items-center py-4 gap-3">
        <!-- Loading More Spinner -->
        <div v-if="loadingMore" class="flex items-center gap-2 text-zinc-500 text-xs">
          <svg class="animate-spin w-4 h-4 text-yellow-500" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
            <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>加载更多...</span>
        </div>

        <!-- End of Feed -->
        <div v-else-if="!hasMore" class="text-center py-6 text-zinc-500 text-xs flex flex-col items-center gap-2 border-t border-zinc-800/60 w-full">
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
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import VideoCard from './VideoCard.vue'
import { videoService } from '../services/videoService'

defineEmits(['trigger-paywall'])

const props = defineProps({
  isVip: {
    type: Boolean,
    default: false
  }
})

const LIMIT = 10  // 每页条数

const loading = ref(true)       // 首页加载
const loadingMore = ref(false)  // 下一页加载
const videos = ref([])
const activeFilter = ref('all')

/** 当前激活（拉流/播放）的视频 ID，同一时间只允许一个 */
const activeVideoId = ref(null)
const currentPage = ref(1)
const hasMore = ref(true)

// 底部哨兵元素（IntersectionObserver 目标）
const sentinelRef = ref(null)
let scrollObserver = null

const filters = [
  { key: 'all', label: '推荐' },
  { key: 'vip', label: 'VIP独家' },
  { key: 'free', label: '免费试看' }
]

/**
 * 预加载一批视频的封面图片
 * 通过 new Image() 触发浏览器提前下载，确保 VideoCard 挂载时封面已在缓存
 */
const preloadPosters = (videoList) => {
  videoList.forEach(video => {
    if (video.poster) {
      const img = new Image()
      img.src = video.poster
    }
  })
}

/**
 * 加载指定页面的视频数据
 * @param {number} page - 页码（从 1 开始）
 * @param {boolean} append - true 追加到现有列表；false 替换（切换 filter 时）
 */
const loadPage = async (page = 1, append = false) => {
  if (page === 1) {
    loading.value = true
  } else {
    loadingMore.value = true
  }

  try {
    const filter = activeFilter.value !== 'all' ? activeFilter.value : null
    const result = await videoService.getVideos(filter, null, page, LIMIT)

    // 立即预加载封面图片（在 DOM 渲染前就开始下载）
    preloadPosters(result.items)

    if (append) {
      videos.value = [...videos.value, ...result.items]
    } else {
      videos.value = result.items
      // 默认激活第一个视频
      if (result.items.length > 0) {
        activeVideoId.value = result.items[0].id
      }
    }

    currentPage.value = result.page
    hasMore.value = result.page < result.totalPages
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

/**
 * 设置底部哨兵的 IntersectionObserver
 * 当哨兵进入视口（提前 300px）时自动拉取下一页
 */
const setupScrollObserver = () => {
  scrollObserver = new IntersectionObserver(
    (entries) => {
      if (
        entries[0].isIntersecting &&
        hasMore.value &&
        !loadingMore.value &&
        !loading.value
      ) {
        loadPage(currentPage.value + 1, true)
      }
    },
    { rootMargin: '300px' }  // 距底部 300px 时提前触发
  )
  if (sentinelRef.value) {
    scrollObserver.observe(sentinelRef.value)
  }
}

onMounted(async () => {
  await loadPage(1, false)
  setupScrollObserver()
})

onUnmounted(() => {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
})

/**
 * 切换过滤器 → 重置到第 1 页
 */
const onFilterChange = (filterKey) => {
  if (activeFilter.value === filterKey) return
  activeFilter.value = filterKey
  currentPage.value = 1
  hasMore.value = true
  activeVideoId.value = null
  loadPage(1, false)
}

/**
 * 某个视频请求成为唯一激活视频（进入视口中心或手动点击）
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
