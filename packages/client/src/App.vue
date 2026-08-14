<template>
  <div class="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
    <!-- Header Navbar -->
    <header class="fixed top-0 inset-x-0 z-30 bg-gradient-to-b from-black/90 via-black/50 to-transparent backdrop-blur-md border-b border-white/5 flex flex-col">
      <!-- 第一行：菜单按钮 / logo / 搜索 / 右侧按钮 -->
      <div class="px-3 sm:px-4 py-2.5 flex items-center gap-2 w-full">
      <!-- 菜单按钮：移动端开抽屉 / PC 切换侧边栏 -->
      <button
        v-if="isHome"
        class="w-9 h-9 shrink-0 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-all active:scale-95"
        @click="onToggleMenu"
        :aria-label="t('feed.openCategories')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <router-link to="/" class="flex items-center gap-2 shrink-0">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-red-600 to-yellow-500 flex items-center justify-center font-black text-black text-sm shadow-md">
          ▶
        </div>
        <span class="font-extrabold text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-300 hidden sm:inline">
          StreamVIP
        </span>
      </router-link>

      <!-- 搜索框（仅首页） -->
      <div v-if="isHome" class="relative flex-1 min-w-0 max-w-md mx-auto">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
        </svg>
        <input
          v-model="searchInput"
          type="text"
          :placeholder="t('feed.searchPlaceholder')"
          @input="onSearchInput"
          class="w-full bg-white/10 border border-white/15 rounded-full pl-9 pr-8 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500/60 focus:ring-1 focus:ring-yellow-500/30 transition-all"
        />
        <button
          v-if="searchInput"
          @click="clearSearch"
          class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-zinc-700/80 hover:bg-zinc-600 flex items-center justify-center text-zinc-300 transition-all"
          :title="t('feed.clearSearch')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex items-center gap-2 shrink-0">
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
      </div>

      <!-- 第二行：热门 tag 快捷入口（仅移动端，横向滚动，内容不足时居中） -->
      <div v-if="isHome" class=" overflow-x-auto px-3 pb-2.5 pt-0.5" style="scrollbar-width: none">
        <div class="flex w-max mx-auto items-center gap-2">
          <button
            @click="selectTag(null)"
            class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border"
            :class="!category.activeTag ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black border-transparent shadow' : 'bg-white/10 text-zinc-300 border-white/10 hover:bg-white/20'"
          >
            {{ t('feed.allCategories') }}
          </button>
          <button
            v-for="tag in hotTags"
            :key="tag.name"
            @click="selectTag(tag.name)"
            class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border"
            :class="category.activeTag === tag.name ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black border-transparent shadow' : 'bg-white/10 text-zinc-300 border-white/10 hover:bg-white/20'"
          >
            {{ tag.name }}
          </button>
        </div>
      </div>
    </header>

    <!-- Router View: Home / Video Detail -->
    <router-view
      v-slot="{ Component }"
      @trigger-paywall="paywall.showPaywall = true"
    >
      <component
        :is="Component"
        @trigger-paywall="paywall.showPaywall = true"
        :search-term="isHome ? searchTerm : undefined"
        @clear-search="clearSearch"
      />
    </router-view>

    <!-- Modals Overlay -->
    <Transition name="fade">
      <NoticeModal v-if="showNotice" :title="noticeTitle" :content="noticeContent" @close="showNotice = false" />
    </Transition>

    <Transition name="fade">
      <AgeGateModal v-if="!ageVerified" @verified="onAgeVerified" />
    </Transition>

    <!-- <Transition name="slide-up">
      <PaywallModal v-if="paywall.showPaywall" @close="paywall.showPaywall = false" @vip-unlocked="onVipUnlocked" />
    </Transition> -->
  </div>
</template>

<script setup>
import { ref, reactive, provide, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AgeGateModal from './components/AgeGateModal.vue'
import NoticeModal from './components/NoticeModal.vue'
import PaywallModal from './components/PaywallModal.vue'
import { trackAnalytics, videoService } from './services/videoService'
import { initAnalytics, shutdownAnalytics } from './services/analyticsService'
import { getCurrentLocale, getToggleLabel, toggleLocale, LOCALE_CHANGED_EVENT } from './i18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/** 分类菜单按钮/搜索框仅在首页（feed）展示 */
const isHome = computed(() => route.path === '/')

// ── 分类/菜单全局状态（header 热门 tag、左侧菜单、移动端抽屉、feed 过滤共用）──
const category = reactive({
  activeTag: null,   // 当前选中 tag（null = 全部），feed 按此过滤
  tags: [],          // 全量标签 [{ name, count }]
  menus: [],         // 导航菜单树（管理侧配置 / 默认菜单）
  drawerOpen: false, // 移动端分类抽屉显隐
  sidebarCollapsed: true, // PC 侧边栏默认收纳（展开/收纳）
})
provide('category', category)

/** 选择 tag（header 热门行 / 菜单 category 类型 / 抽屉） */
const selectTag = (tag) => {
  category.activeTag = tag === category.activeTag ? null : tag
  category.drawerOpen = false
}

/** 菜单按钮：PC 切换侧边栏展开/收纳；移动端打开分类抽屉 */
const onToggleMenu = () => {
  if (window.matchMedia('(min-width: 1024px)').matches) {
    category.sidebarCollapsed = !category.sidebarCollapsed
  } else {
    category.drawerOpen = true
  }
}

/** 点击菜单项：category → 过滤 feed；link → 路由跳转 */
const onMenuSelect = (menu) => {
  if (!menu) return
  if (menu.type === 'category') {
    const tags = (menu.target && menu.target.tags) || []
    selectTag(tags.length ? tags[0] : null)
  } else if (menu.type === 'link' && menu.target && menu.target.url) {
    category.drawerOpen = false
    router.push(menu.target.url)
  } else {
    category.drawerOpen = false
  }
}

/** 分类/菜单动作（供 HomeView 侧边栏/抽屉回调） */
provide('categoryActions', {
  selectTag,
  onMenuSelect
})

/** header 热门 tag：全量标签最热前 8 */
const hotTags = computed(() => category.tags.slice(0, 8))

const fetchTagsAndMenus = async () => {
  category.tags = await videoService.getTags()
  category.menus = await videoService.getMenus()
}

// ── 搜索：header 输入防抖 300ms 后生效，searchTerm 为实际查询词（下传 VideoFeed）──
const searchInput = ref('')
const searchTerm = ref('')
let searchDebounceTimer = null

const onSearchInput = () => {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    if (searchTerm.value === searchInput.value.trim()) return
    searchTerm.value = searchInput.value.trim()
  }, 300)
}

const clearSearch = () => {
  clearTimeout(searchDebounceTimer)
  searchInput.value = ''
  searchTerm.value = ''
}
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

  // 分类标签 + 导航菜单（header 热门 tag / 左侧菜单 / 抽屉共用）
  fetchTagsAndMenus()

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
