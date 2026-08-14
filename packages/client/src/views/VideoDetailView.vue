<template>
  <div class="w-full h-full overflow-y-auto pt-14 bg-(--bg-page)">
    <div class="max-w-6xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
      <!-- Top Bar: Back + Title -->
      <div class="flex items-center gap-3">
        <button
          @click="goBack"
          class="shrink-0 w-9 h-9 rounded-full bg-(--bg-hover)/80 hover:bg-zinc-700 border border-(--border-subtle)/60 flex items-center justify-center text-zinc-200 transition-all"
          :title="t('detail.back')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div class="min-w-0">
          <div class="text-[10px] text-(--text-faint) font-bold tracking-widest uppercase">{{ t('detail.pageTitle') }}</div>
          <div class="text-sm text-(--text-secondary) font-bold truncate">{{ video?.title || '...' }}</div>
        </div>
      </div>

      <div v-if="loading" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-(--bg-card) border border-(--border-subtle) rounded-2xl aspect-video animate-pulse"></div>
        <div class="flex flex-col gap-3">
          <div v-for="n in 4" :key="n" class="bg-(--bg-card) border border-(--border-subtle) rounded-2xl aspect-video animate-pulse"></div>
        </div>
      </div>

      <template v-else-if="video">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <!-- Left: Player + Meta -->
          <div class="lg:col-span-2 flex flex-col gap-4 min-w-0">
            <MemoryVideoPlayer
              :video="video"
              :muted="true"
              :is-vip-unlocked="paywall.enabled ? paywall.isVip : true"
              :active="true"
              :autoplay="true"
              @trial-ended="handleTrialEnded"
            />

            <!-- Meta Section -->
            <div class="bg-(--bg-card)/70 border border-(--border-subtle)/70 rounded-2xl p-5 flex flex-col gap-4">
              <h1 class="text-xl font-black text-(--text-primary) leading-snug">{{ video.title }}</h1>

              <div class="flex flex-wrap items-center gap-2 text-xs">
                <img
                  :src="video.authorAvatar || defaultAvatar"
                  class="w-8 h-8 rounded-full object-cover border border-(--border-subtle)"
                />
                <div class="flex flex-col">
                  <span class="font-bold text-zinc-200">{{ video.author }}</span>
                  <span class="text-[10px] text-(--text-faint)">{{ t('detail.published') }} {{ formatDate(video.createdAt) }}</span>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-4 text-xs text-(--text-muted) border-y border-(--border-subtle)/70 py-3">
                <span class="flex items-center gap-1.5" :title="t('card.validViews')">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span class="font-mono font-bold text-(--text-secondary)">{{ formatCount(video.validViews || 0) }}</span>
                </span>
                <button @click="toggleLike" class="flex items-center gap-1.5 transition-colors" :class="isLiked ? 'text-red-500' : 'hover:text-red-400'">
                  <svg xmlns="http://www.w3.org/2000/svg" :fill="isLiked ? 'currentColor' : 'none'" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                  <span class="font-mono font-bold">{{ formatCount(likesCount) }}</span>
                </button>
                <span v-if="video.duration" class="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span class="font-mono font-bold">{{ video.duration }}</span>
                </span>
              </div>

              <div v-if="tags.length" class="flex flex-wrap gap-2">
                <span
                  v-for="tag in tags"
                  :key="tag"
                  class="px-2.5 py-1 bg-(--bg-hover) text-(--text-secondary) text-[11px] font-medium rounded-lg border border-(--border-subtle)/50"
                >
                  #{{ tag }}
                </span>
              </div>

              <div v-if="video.description" class="text-sm text-(--text-muted) leading-relaxed whitespace-pre-line">
                {{ video.description }}
              </div>
            </div>

            <!-- 评论区 -->
            <CommentSection :video-id="video.id" />
          </div>

          <!-- Right: Related Videos -->
          <aside class="flex flex-col gap-3 min-w-0">
            <div class="text-xs font-black text-(--text-faint) tracking-widest uppercase px-1">{{ t('detail.related') }}</div>
            <div v-if="relatedLoading" class="flex flex-col gap-3">
              <div v-for="n in 4" :key="n" class="bg-(--bg-card) border border-(--border-subtle) rounded-2xl aspect-video animate-pulse"></div>
            </div>
            <button
              v-for="item in relatedVideos"
              :key="item.id"
              @click="openRelated(item.id)"
              class="flex gap-3 bg-(--bg-card)/60 hover:bg-(--bg-hover)/70 border border-(--border-subtle)/60 rounded-xl p-2.5 text-left transition-all group"
            >
              <div class="relative w-32 shrink-0 aspect-video rounded-lg overflow-hidden bg-(--bg-hover)">
                <img
                  v-if="item.poster"
                  :src="item.poster"
                  :alt="item.title"
                  loading="lazy"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div class="min-w-0 flex flex-col justify-center gap-1">
                <div class="text-xs font-bold text-zinc-200 line-clamp-2 group-hover:text-yellow-400 transition-colors">{{ item.title }}</div>
                <div class="text-[10px] text-(--text-faint)">{{ item.author }}</div>
                <div class="text-[10px] text-(--text-faint) font-mono flex items-center gap-2">
                  <span>{{ formatCount(item.validViews || 0) }} {{ t('detail.views') }}</span>
                  <span v-if="item.duration">{{ item.duration }}</span>
                </div>
              </div>
            </button>
            <div v-if="!relatedLoading && !relatedVideos.length" class="text-xs text-(--text-faint) px-1">
              {{ t('detail.noRelated') }}
            </div>
          </aside>
        </div>
      </template>

      <div v-else class="py-20 text-center text-(--text-faint) text-sm">
        {{ t('detail.notFound') }}
        <button @click="goBack" class="block mx-auto mt-4 px-5 py-2 bg-(--bg-hover) hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-(--border-subtle) transition-all">
          {{ t('detail.back') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MemoryVideoPlayer from '../components/MemoryVideoPlayer.vue'
import CommentSection from '../components/CommentSection.vue'
import { videoService } from '../services/videoService'
import { trackEvent } from '../services/analyticsService'

const props = defineProps({
  id: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['trigger-paywall'])

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 全局付费墙状态（App 提供）
const paywall = inject('paywall')

const defaultAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop'

const video = ref(null)
const loading = ref(true)
const relatedVideos = ref([])
const relatedLoading = ref(false)
const isLiked = ref(false)
const likesCount = ref(0)

const tags = computed(() => {
  if (!video.value) return []
  return typeof video.value.tags === 'string' ? JSON.parse(video.value.tags) : (video.value.tags || [])
})

const loadVideo = async (videoId) => {
  loading.value = true
  video.value = null
  relatedVideos.value = []
  try {
    const detail = await videoService.getVideoById(videoId)
    video.value = detail
    isLiked.value = !!detail.isLiked
    likesCount.value = Number(detail.likes || 0)
    if (detail && detail.id) {
      trackEvent('DETAIL_VIEW', { videoId: detail.id })
    }
    loadRelated(videoId)
  } catch (e) {
    console.warn('Failed to load video detail:', e)
  } finally {
    loading.value = false
  }
}

/** 相关推荐：同标签优先，无标签则取最新列表（排除当前视频） */
const loadRelated = async (videoId) => {
  relatedLoading.value = true
  try {
    const primaryTag = tags.value && tags.value.length ? tags.value[0] : null
    const result = await videoService.getVideos(null, primaryTag, 1, 8)
    let items = result.items || []
    if (!primaryTag) {
      const all = await videoService.getVideos(null, null, 1, 9)
      items = all.items || []
    }
    relatedVideos.value = items.filter(v => v.id !== videoId).slice(0, 6)
  } catch (e) {
    console.warn('Failed to load related videos:', e)
  } finally {
    relatedLoading.value = false
  }
}

const handleTrialEnded = () => {
  if (paywall.enabled && !paywall.isVip) {
    emit('trigger-paywall')
  }
}

const toggleLike = async () => {
  isLiked.value = !isLiked.value
  likesCount.value += isLiked.value ? 1 : -1
  try {
    await videoService.toggleLike(video.value.id)
  } catch (e) {
    // 乐观更新失败不回滚（接口有 fallback）
  }
}

const openRelated = (videoId) => {
  if (videoId === video.value?.id) return
  // replace：back 直接回首页流，而不是在相关视频间来回跳
  router.replace({ name: 'video-detail', params: { id: videoId } })
}

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'home' })
  }
}

const formatCount = (count) => {
  const n = Number(count || 0)
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  return n
}

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 路由参数变化（相关视频点击）→ 重新加载
watch(
  () => props.id,
  (newId) => {
    if (newId) loadVideo(newId)
  }
)

onMounted(() => {
  if (props.id) loadVideo(props.id)
})
</script>
