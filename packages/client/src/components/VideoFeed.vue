<template>
  <div class="w-full px-3 sm:px-6 py-6 sm:py-8">
    <!-- Stream Header -->
    <!-- <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-red-500 animate-ping"></div>
        <h3 class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
          {{ t('feed.title') }}
        </h3>
      </div>
    </div> -->

    <!-- Empty Search Result State -->
    <div v-if="!loading && !loadingMore && videos.length === 0 && searchTerm" class="flex flex-col items-center py-14 text-zinc-500 gap-3">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-zinc-600">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <p class="text-sm">{{ t('feed.searchNoResults') }}</p>
      <button @click="$emit('clear-search')" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 transition-all">
        {{ t('feed.clearSearch') }}
      </button>
    </div>

    <!-- Skeleton Loaders (first page) -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
      <div v-for="n in 8" :key="n" class="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 animate-pulse">
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
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
      <template v-for="item in displayItems" :key="item.__isAd ? 'ad-' + item.id : item.id">
        <AdCard v-if="item.__isAd" :ad="item" />
        <VideoCard
          v-else
          :video="item"
          :is-vip-unlocked="isVip"
          :paywall-enabled="paywallEnabled"
          :active="activeVideoId === item.id"
          @trigger-paywall="$emit('trigger-paywall', $event)"
          @request-activate="onRequestActivate"
          @request-pause="onRequestPause"
        />
      </template>

      <!-- Infinite Scroll Sentinel + Loading More Indicator -->
      <div ref="sentinelRef" class="col-span-full flex flex-col items-center py-4 gap-3">
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
          v-if="paywallEnabled && !isVip"
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VideoCard from './VideoCard.vue'
import AdCard from './AdCard.vue'
import { videoService } from '../services/videoService'
import { getCurrentLocale, LOCALE_CHANGED_EVENT } from '../i18n'

const { t } = useI18n()

const emit = defineEmits(['trigger-paywall', 'clear-search'])

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
  /** 当前分类标签（null = 全部），由 App 持有（侧边栏/移动端抽屉共用） */
  tag: {
    type: String,
    default: null
  },
  /** 搜索词（App header 输入，防抖 300ms 后生效），变化时重置重拉 */
  searchTerm: {
    type: String,
    default: ''
  }
})

const LIMIT = 10  // 每页条数

const loading = ref(true)       // 首页加载
const loadingMore = ref(false)  // 下一页加载
const videos = ref([])

// 请求竞态保护：只认最后一次发起的请求结果
let requestSeq = 0

// ── 广告（信息流原生插卡）──
const ads = ref([])
const adsEnabled = ref(false)
const adsFeedInterval = ref(6)

/**
 * 拉取广告配置（总开关 + 间隔）与当前广告列表。
 * 展示规则：adsEnabled 且（收费模式关闭 或 非 VIP）——VIP 免广告是会员权益。
 */
const fetchAdConfig = async () => {
  try {
    const res = await fetch('/api/v1/settings')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        adsEnabled.value = json.data.adsEnabled === true || json.data.adsEnabled === 'true'
        adsFeedInterval.value = Math.max(2, Number(json.data.adsFeedInterval) || 6)
      }
    }
  } catch (e) {
    console.warn('Failed to fetch ad config:', e)
  }
  if (adsEnabled.value) {
    ads.value = await videoService.getAds('feed', false)
  }
}

/** 是否展示广告：总开关开 + （免费模式 或 非 VIP） */
const showAds = computed(() => adsEnabled.value && !(props.paywallEnabled && props.isVip))

/**
 * 交错渲染列表：每 adsFeedInterval 条视频插 1 条广告；
 * 按当前页轮换广告顺序，避免每页都从第一条开始。
 */
const displayItems = computed(() => {
  if (!showAds.value || !ads.value.length) return videos.value
  const interval = Math.max(2, adsFeedInterval.value)
  const items = []
  const offset = ((currentPage.value - 1) * Math.ceil(LIMIT / interval)) % ads.value.length
  let adIndex = offset
  videos.value.forEach((v, i) => {
    items.push(v)
    if ((i + 1) % interval === 0) {
      items.push({ __isAd: true, ...ads.value[adIndex % ads.value.length] })
      adIndex++
    }
  })
  return items
})

/** 当前激活（拉流/播放）的视频 ID，同一时间只允许一个 */
const activeVideoId = ref(null)
const currentPage = ref(1)
const hasMore = ref(true)

// 底部哨兵元素（IntersectionObserver 目标）
const sentinelRef = ref(null)
let scrollObserver = null

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
    const result = await videoService.getVideos(null, props.tag, page, LIMIT, props.searchTerm)
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
  fetchAdConfig()
  setupScrollObserver()
  window.addEventListener(LOCALE_CHANGED_EVENT, onLocaleChanged)
})

onUnmounted(() => {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
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

/** 搜索词变化（header 输入防抖生效/清除）→ 重置列表重拉，保留当前分类 */
watch(
  () => props.searchTerm,
  () => {
    currentPage.value = 1
    hasMore.value = true
    activeVideoId.value = null
    loadPage(1, false)
  }
)

/** 移动端分类入口已改为抽屉（CategoryDrawer），由 HomeView 持有 tag 状态 */

// 分类标签变化（侧边栏/移动端抽屉）→ 重置列表重新拉取（搜索词保留叠加）
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
