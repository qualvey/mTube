<template>
  <div class="w-full max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">
    <!-- Stream Header -->
    <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-red-500 animate-ping"></div>
        <h3 class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
          {{ t('feed.title') }}
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
          {{ t(`feed.filter${filter.key === 'all' ? 'All' : filter.key === 'vip' ? 'Vip' : 'Free'}`) }}
        </button>
      </div>
    </div>

    <!-- Mobile Category Chips (lg 以下显示，桌面用侧边栏) -->
    <div class="lg:hidden flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style="scrollbar-width: none">
      <button
        @click="onMobileTagSelect(null)"
        class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border"
        :class="!tag ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black border-transparent shadow' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'"
      >
        {{ t('feed.allCategories') }}
      </button>
      <button
        v-for="item in tags"
        :key="item.name"
        @click="onMobileTagSelect(item.name)"
        class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1"
        :class="tag === item.name ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black border-transparent shadow' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'"
      >
        {{ item.name }}
        <span class="text-[9px] font-mono opacity-60">{{ item.count }}</span>
      </button>
    </div>

    <!-- Search Bar (300ms debounce + stale response guard) -->
    <div class="relative">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
      </svg>
      <input
        v-model="searchInput"
        type="text"
        :placeholder="t('feed.searchPlaceholder')"
        @input="onSearchInput"
        class="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500/60 focus:ring-1 focus:ring-yellow-500/30 transition-all"
      />
      <button
        v-if="searchInput"
        @click="clearSearch"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-zinc-700/80 hover:bg-zinc-600 flex items-center justify-center text-zinc-300 transition-all"
        :title="t('feed.clearSearch')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Empty Search Result State -->
    <div v-if="!loading && !loadingMore && videos.length === 0 && searchTerm" class="flex flex-col items-center py-14 text-zinc-500 gap-3">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-zinc-600">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <p class="text-sm">{{ t('feed.searchNoResults') }}</p>
      <button @click="clearSearch" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 transition-all">
        {{ t('feed.clearSearch') }}
      </button>
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
        :paywall-enabled="paywallEnabled"
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
          <span>{{ t('feed.loadingMore') }}</span>
        </div>

        <!-- End of Feed -->
        <div v-else-if="!hasMore" class="text-center py-6 text-zinc-500 text-xs flex flex-col items-center gap-2 border-t border-zinc-800/60 w-full">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-zinc-600">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <span>{{ t('feed.endOfFeed') }}</span>
          <button 
            @click="$emit('trigger-paywall')" 
            class="mt-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-black font-extrabold text-xs rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all"
          >
            {{ t('feed.unlockAll') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VideoCard from './VideoCard.vue'
import { videoService } from '../services/videoService'
import { getCurrentLocale, LOCALE_CHANGED_EVENT } from '../i18n'

const { t } = useI18n()

const emit = defineEmits(['trigger-paywall', 'tag-change'])

const props = defineProps({
  isVip: {
    type: Boolean,
    default: false
  },
  /** 收费模式开关（管理员控制）：false = 全站免费，隐藏全部 VIP 相关 UI */
  paywallEnabled: {
    type: Boolean,
    default: true
  },
  /** 当前分类标签（null = 全部），由 App 持有（侧边栏/移动端 chips 共用） */
  tag: {
    type: String,
    default: null
  },
  /** 全量标签列表 [{ name, count }] */
  tags: {
    type: Array,
    default: () => []
  }
})

const LIMIT = 10  // 每页条数

const loading = ref(true)       // 首页加载
const loadingMore = ref(false)  // 下一页加载
const videos = ref([])
const activeFilter = ref('all')

// 搜索：searchInput 即时输入（防抖 300ms 后生效），searchTerm 为实际查询词
const searchInput = ref('')
const searchTerm = ref('')
let searchDebounceTimer = null
// 请求竞态保护：只认最后一次发起的请求结果
let requestSeq = 0

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

  const seq = ++requestSeq

  try {
    const filter = activeFilter.value !== 'all' ? activeFilter.value : null
    const result = await videoService.getVideos(filter, props.tag, page, LIMIT, searchTerm.value)
    if (seq !== requestSeq) return // 过期响应直接丢弃
    preloadPosters(result.items)

    if (append) {
      videos.value = [...videos.value, ...result.items]
    } else {
      videos.value = result.items
      // 默认激活第一个视频
      if (result.items.length > 0) {
        activeVideoId.value = result.items[0].id
      } else {
        activeVideoId.value = null
      }
    }

    currentPage.value = result.page
    hasMore.value = result.page < result.totalPages
  } finally {
    if (seq === requestSeq) {
      loading.value = false
      loadingMore.value = false
    }
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
  window.addEventListener(LOCALE_CHANGED_EVENT, onLocaleChanged)
})

onUnmounted(() => {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
  clearTimeout(searchDebounceTimer)
  window.removeEventListener(LOCALE_CHANGED_EVENT, onLocaleChanged)
})

// 语言切换 → 重置到第 1 页并按新语言重拉（动态内容标题/描述随语言变化）
const onLocaleChanged = () => {
  if (getCurrentLocale()) {
    currentPage.value = 1
    hasMore.value = true
    loadPage(1, false)
  }
}

/** 搜索防抖：输入停止 300ms 后触发查询（保留当前筛选条件） */
const onSearchInput = () => {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    if (searchTerm.value === searchInput.value.trim()) return
    searchTerm.value = searchInput.value.trim()
    currentPage.value = 1
    hasMore.value = true
    activeVideoId.value = null
    loadPage(1, false)
  }, 300)
}

/** 清除搜索并恢复全部列表 */
const clearSearch = () => {
  clearTimeout(searchDebounceTimer)
  searchInput.value = ''
  searchTerm.value = ''
  currentPage.value = 1
  hasMore.value = true
  activeVideoId.value = null
  loadPage(1, false)
}

/** 移动端分类 chips：点击选中（再点取消），由 App 统一持有 tag 状态 */
const onMobileTagSelect = (tagName) => {
  emit('tag-change', tagName === props.tag ? null : tagName)
}

// 分类标签变化（侧边栏/移动端 chips）→ 重置列表重新拉取
watch(
  () => props.tag,
  () => {
    currentPage.value = 1
    hasMore.value = true
    activeVideoId.value = null
    loadPage(1, false)
  }
)

/**
 * 切换过滤器 → 重置到第 1 页（保留当前搜索词，筛选与搜索叠加）
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
