<template>
  <div
    class="w-full h-full overflow-y-auto scroll-smooth pt-[104px] lg:pt-24"
    ref="scrollContainer"
    @scroll="handleScroll"
  >
    <!-- Hero Section -->
    <!-- <HeroSection :blur="paywall.showPaywall" /> -->

    <!-- Desktop Sidebar + Feed Two-Column Layout -->
    <div class="w-full min-h-full">
      <CategorySidebar
        :menus="visibleMenus"
        :active-tag="category.activeTag"
        :collapsed="category.sidebarCollapsed"
        @select="onMenuSelect"
        @toggle="category.sidebarCollapsed = !category.sidebarCollapsed"
      />
      <div class="min-w-0">
        <!-- Video Feed Stream (Backend Controlled) -->
        <VideoFeed
          :class="{ 'blur-sm brightness-75 transition-all duration-500': paywall.showPaywall }"
          :is-vip="paywall.isVip"
          :paywall-enabled="paywall.enabled"
          :tag="category.activeTag"
          :search-term="searchTerm"
          @trigger-paywall="paywall.showPaywall = true"
          @clear-search="emit('clear-search')"
        />
      </div>
    </div>

    <!-- 移动端分类抽屉（左侧滑出） -->
    <CategoryDrawer
      :open="category.drawerOpen"
      :menus="visibleMenus"
      :active-tag="category.activeTag"
      @select="onMenuSelect"
      @close="category.drawerOpen = false"
    />

    <!-- Scroll Transition Area (Suspense Content) -->
    <ScrollTransition v-if="paywall.enabled && !paywall.isVip"  :progress="scrollProgress" :blur="paywall.showPaywall" />

    <!-- Paywall Trigger Footer Section -->
    <!-- <div v-if="paywall.enabled && !paywall.isVip" class="py-16 w-full flex flex-col items-center justify-center bg-(--bg-page)/90 border-t border-(--border-subtle) text-center px-4">
      <h4 class="text-xl font-bold text-(--text-primary) mb-2">{{ t('app.wantMoreTitle') }}</h4>
      <p class="text-xs text-(--text-muted) mb-6 max-w-xs">{{ t('app.wantMoreDesc') }}</p>
      <button
        @click="paywall.showPaywall = true"
        class="px-8 py-3.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black font-black text-sm rounded-2xl shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:scale-105 active:scale-95 transition-all"
      >
        {{ t('app.unlockNow') }}
      </button>
    </div> -->
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { useScroll } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import VideoFeed from '../components/VideoFeed.vue'
import CategorySidebar from '../components/CategorySidebar.vue'
import CategoryDrawer from '../components/CategoryDrawer.vue'
import ScrollTransition from '../components/ScrollTransition.vue'

const { t } = useI18n()

// 全局付费墙状态（App 提供）：{ enabled, isVip, showPaywall }
const paywall = inject('paywall')
const { currentUser } = inject('user') || { currentUser: null }

/**
 * 按可见性过滤菜单树：all 全可见 / guest 仅游客 / logged_in 仅登录 / vip 仅 VIP
 * 子项跟随父项（父不可见则整支隐藏）
 */
const visibleMenus = computed(() => {
  const filter = (items) => (items || []).filter((m) => {
    if (m.visibility === 'guest' && (currentUser.value || paywall.isVip)) return false
    if (m.visibility === 'logged_in' && !currentUser.value) return false
    if (m.visibility === 'vip' && !paywall.isVip) return false
    m.children = filter(m.children)
    return true
  })
  return filter(category.menus)
})

// 分类/菜单全局状态（App 提供）：{ activeTag, tags, menus, drawerOpen }
const category = inject('category')
// 分类/菜单动作（App 提供）：{ selectTag, onMenuSelect }
const { onMenuSelect } = inject('categoryActions')

// 搜索词（App header 输入，防抖后下传）与清除事件
const props = defineProps({
  searchTerm: {
    type: String,
    default: ''
  }
})
const emit = defineEmits(['clear-search'])
const searchTerm = computed(() => props.searchTerm)

const scrollContainer = ref(null)
const scrollProgress = ref(0)
const lastY = ref(0)
const { y } = useScroll(scrollContainer)

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
