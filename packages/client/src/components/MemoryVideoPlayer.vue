<template>
  <div 
    class="relative w-full h-full bg-black rounded-xl overflow-hidden group shadow-2xl transition-all duration-300 flex items-center justify-center max-h-[75vh]"
    :style="{ aspectRatio: displayAspect }"
    @mousemove="handleContainerMouseMove"
    @mouseleave="hoveringProgress = false"
  >
    <!-- Idle State: 封面 + 播放按钮（未激活/未开始时展示） -->
    <div
      v-if="!hasStarted"
      class="absolute inset-0 z-20 flex items-center justify-center cursor-pointer"
      @click="onManualPlay"
    >
      <!-- 封面图 -->
      <img
        v-if="video.poster"
        :src="video.poster"
        class="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        @load="handlePosterLoad"
      />
      <!-- 暗色蒙层 -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30 transition-opacity group-hover:from-black/80" />
      <!-- 播放按钮 -->
      <div class="relative z-10 w-16 h-16 rounded-full bg-yellow-500/90 backdrop-blur-sm flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.5)] transition-all duration-200 hover:scale-110 hover:bg-yellow-400 active:scale-95">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8 text-black ml-1">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div
      v-else-if="loading"
      class="absolute inset-0 z-30 bg-black/80 flex items-center justify-center"
    >
      <svg class="animate-spin w-10 h-10 text-yellow-400" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
        <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Error Overlay -->
    <div 
      v-else-if="errorMessage" 
      class="absolute inset-0 z-30 bg-zinc-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
    >
      <div class="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p class="text-xs text-red-300 font-semibold mb-3 max-w-xs">{{ errorMessage }}</p>
      <button 
        @click="onManualPlay" 
        class="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-lg border border-zinc-600 transition-all"
      >
        {{ t('player.retry') }}
      </button>
    </div>

    <!-- Surrit Seek Sprite Hover Preview Tooltip -->
    <div 
      v-if="globalSeekPreviewEnabled && (props.enableSeekPreview !== false) && hoveringProgress && currentSpriteUrl"
      class="absolute bottom-14 -translate-x-1/2 bg-black/95 p-1.5 rounded-xl border border-yellow-500/40 shadow-2xl pointer-events-none z-40 flex flex-col items-center gap-1 backdrop-blur-md transition-all duration-75"
      :style="{ left: `${hoverX}px` }"
    >
      <div 
        class="relative w-40 h-[90px] overflow-hidden rounded-lg bg-zinc-900 border border-zinc-700/60 shadow-inner"
        :style="{
          backgroundImage: `url('${currentSpriteUrl}')`,
          backgroundSize: '1000% 1000%',
          backgroundPosition: `${spriteStyle.posX}% ${spriteStyle.posY}%`,
          backgroundRepeat: 'no-repeat'
        }"
      >
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
      </div>
      <span class="text-[10px] font-mono font-bold text-yellow-400 tracking-wider">
        {{ formatTime(hoverTime) }}
      </span>
    </div>

    <!-- Video Element (Bound with Plyr) -->
    <video
      ref="videoRef"
      :poster="video.poster"
      playsinline
      crossorigin="anonymous"
      @loadedmetadata="handleLoadedMetadata"
      class="plyr-video-element w-full h-full object-contain"
    ></video>

    <!-- 自定义竖向音量控件：横向仅一个按钮，bar 竖向展示（让进度条最大化） -->
    <div
      class="absolute right-2 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2"
      @mouseenter="volOpen = true"
      @mouseleave="volOpen = false"
    >
      <div
        v-show="volOpen"
        class="flex flex-col items-center gap-1.5 bg-black/80 backdrop-blur-md border border-white/10 rounded-full py-2.5 px-1 shadow-xl"
      >
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="volume"
          @input="onVolumeInput"
          class="vol-range"
          :aria-label="t('player.volume')"
        />
      </div>
      <button
        @click="toggleVolumePanel"
        class="w-8 h-8 rounded-full bg-black/60 hover:bg-black/85 border border-white/10 text-white flex items-center justify-center transition-all active:scale-95"
        :title="t('player.volume')"
        :aria-label="t('player.volume')"
      >
        <svg v-if="currentMuted || volume === 0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 10-1.06-1.06l-1.72 1.72-1.72-1.72z" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 01-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import Plyr from 'plyr'
import Hls from 'hls.js'
import { createPlaybackId, trackEvent } from '../services/analyticsService'
import 'plyr/dist/plyr.css'

export interface CustomHeaders {
  [key: string]: string
}

export interface VideoItem {
  id?: string
  title?: string
  videoUrl: string
  poster?: string
  headers?: CustomHeaders | string | null
  isVip?: boolean
  [key: string]: any
}

export interface ComponentProps {
  video: VideoItem
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  enableSeekPreview?: boolean
  isVipUnlocked?: boolean
  previewDuration?: number
  /** 控制此播放器是否为当前激活（加载+播放）状态，默认 true 保持向后兼容 */
  active?: boolean
  /** 强制固定宽高比（如 "16 / 9"），用于 grid 多列布局下统一卡片封面；不传则按 poster/视频动态自适应 */
  forceAspectRatio?: string
}

const props = withDefaults(defineProps<ComponentProps>(), {
  autoplay: false,
  loop: false,
  muted: true,
  enableSeekPreview: true,
  isVipUnlocked: false,
  active: true,
  forceAspectRatio: undefined
})

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'loaded', objectUrl: string): void
  (e: 'error', error: Error): void
  (e: 'play'): void
  (e: 'pause'): void
  (e: 'trial-ended', limit: number): void
  /** 播放器请求成为唯一激活视频（由父层响应，abort 其他） */
  (e: 'request-activate'): void
}>()

// Reactive States
const videoRef = ref<HTMLVideoElement | null>(null)
const loading = ref<boolean>(false)   // 初始 false，idle 状态下不显示 spinner
const progress = ref<number>(0)
const errorMessage = ref<string | null>(null)

// ── 音量（自定义竖向控件）与播放暂停状态 ────────────────────
const volume = ref(1)
const currentMuted = ref(props.muted)
const volOpen = ref(false)
/** 用户手动暂停标记：true 后不再自动播放，直到用户主动点击播放 */
const userPaused = ref(false)
/** 程序性暂停标记：区分用户主动 pause 与代码 pause（active 切换/清理/试看结束） */
let programmaticPause = false

/** 是否已开始拉流（false = idle 状态，展示封面+播放按钮） */
const hasStarted = ref<boolean>(false)

// Aspect Ratio State for Landscape / Portrait Auto Adaptation
const videoAspectRatio = ref<string>('16 / 9')
const isPortrait = ref<boolean>(false)

/** 展示宽高比：传了 forceAspectRatio（grid 场景）用固定值，否则动态自适应 */
const displayAspect = computed(() => props.forceAspectRatio || videoAspectRatio.value)

/** 展示宽高比：传了 forceAspectRatio（grid 场景）用固定值，否则动态自适应 */

/**
 * 封面图加载完成 → 检测实际尺寸 → 更新容器比例
 * 无论是否已激活都应用：拉流过程中容器保持封面比例（不跳横屏），
 * 视频元数据到达后由 handleLoadedMetadata 覆盖为真实比例。
 */
const handlePosterLoad = (e: Event) => {
  const img = e.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) {
    videoAspectRatio.value = `${img.naturalWidth} / ${img.naturalHeight}`
    isPortrait.value = img.naturalHeight > img.naturalWidth
  }
}

const handleLoadedMetadata = (e?: Event) => {
  const el = (e?.target as HTMLVideoElement) || videoRef.value
  if (el && el.videoWidth && el.videoHeight) {
    const w = el.videoWidth
    const h = el.videoHeight
    isPortrait.value = h > w
    videoAspectRatio.value = `${w} / ${h}`
    console.log(`[MemoryVideoPlayer Debug] 📐 Dynamic aspect ratio detected: ${w}x${h} (${videoAspectRatio.value}), isPortrait: ${isPortrait.value}`)
  }
}

// Seek Hover Preview States
const hoveringProgress = ref<boolean>(false)
const hoverX = ref<number>(0)
const hoverTime = ref<number>(0)
const currentSpriteUrl = ref<string | null>(null)
const spriteStyle = ref<{ posX: number; posY: number }>({ posX: 0, posY: 0 })
const globalSeekPreviewEnabled = ref<boolean>(true)

let plyrInstance: Plyr | null = null
let hlsInstance: Hls | null = null
let currentAbortController: AbortController | null = null

let analyticsPlaybackId: string | null = null
let analyticsStarted = false
let analyticsValidView = false
let analyticsComplete = false
let analyticsWatchSeconds = 0
let analyticsTotalWatchSeconds = 0
let analyticsLastTickAt = 0
let analyticsLastPosition = 0
let analyticsTimer: number | null = null
let analyticsMilestones = new Set<number>()
let analyticsSkipped = false

const getPlaybackPosition = () => Number(videoRef.value?.currentTime || 0)
const getPlaybackDuration = () => Number(videoRef.value?.duration || 0)

const trackPlaybackEvent = (eventName: string, extra: Record<string, any> = {}) => {
  if (!analyticsPlaybackId || !props.video?.id) return
  trackEvent(eventName, {
    videoId: props.video.id,
    playbackId: analyticsPlaybackId,
    positionSeconds: getPlaybackPosition(),
    durationSeconds: getPlaybackDuration(),
    ...extra
  })
}

const flushWatchTime = () => {
  if (!analyticsValidView || analyticsWatchSeconds < 0.5) {
    if (!analyticsValidView) analyticsWatchSeconds = 0
    return
  }
  const watchSeconds = Number(analyticsWatchSeconds.toFixed(3))
  analyticsWatchSeconds = 0
  trackPlaybackEvent('WATCH_TIME', { watchSeconds })
}

const tickWatchTime = () => {
  const now = performance.now()
  const elapsedSeconds = analyticsLastTickAt
    ? Math.min((now - analyticsLastTickAt) / 1000, 1.5)
    : 0
  analyticsLastTickAt = now

  const element = videoRef.value
  const canCount = Boolean(
    analyticsStarted &&
    props.active &&
    document.visibilityState === 'visible' &&
    element &&
    !element.paused &&
    !element.ended
  )
  if (!canCount || elapsedSeconds <= 0) return

  analyticsWatchSeconds += elapsedSeconds
  analyticsTotalWatchSeconds += elapsedSeconds
  if (!analyticsValidView && analyticsTotalWatchSeconds >= 2) {
    analyticsValidView = true
    trackPlaybackEvent('VIDEO_2S')
  }
  if (analyticsValidView && analyticsWatchSeconds >= 10) flushWatchTime()
}

const startPlaybackAnalytics = () => {
  if (!analyticsPlaybackId) analyticsPlaybackId = createPlaybackId()
  if (!analyticsStarted) {
    analyticsStarted = true
    trackPlaybackEvent('VIDEO_START')
  }
  analyticsLastTickAt = performance.now()
  if (!analyticsTimer) {
    analyticsTimer = window.setInterval(tickWatchTime, 1000)
  }
}

const trackPlaybackProgress = () => {
  if (!analyticsValidView || !videoRef.value) return
  const duration = getPlaybackDuration()
  const position = getPlaybackPosition()
  const positionDelta = position - analyticsLastPosition
  analyticsLastPosition = position
  if (!Number.isFinite(duration) || duration <= 0) return
  // 倒退或大幅前进（seek）：本次播放会话禁止补发进度节点与完播，防拖拽刷量
  if (positionDelta < 0 || positionDelta > 2.5) {
    analyticsSkipped = true
    return
  }
  if (analyticsSkipped) return

  const ratio = position / duration
  for (const milestone of [25, 50, 75]) {
    if (ratio >= milestone / 100 && !analyticsMilestones.has(milestone)) {
      analyticsMilestones.add(milestone)
      trackPlaybackEvent(`VIDEO_${milestone}`)
    }
  }
}

const resetPlaybackAnalytics = () => {
  if (analyticsTimer) window.clearInterval(analyticsTimer)
  analyticsTimer = null
  analyticsPlaybackId = null
  analyticsStarted = false
  analyticsValidView = false
  analyticsComplete = false
  analyticsWatchSeconds = 0
  analyticsTotalWatchSeconds = 0
  analyticsLastTickAt = 0
  analyticsLastPosition = 0
  analyticsMilestones = new Set<number>()
  analyticsSkipped = false
}

const stopPlaybackAnalytics = (completed = false) => {
  tickWatchTime()
  if (completed && analyticsValidView && !analyticsSkipped && analyticsMilestones.has(75) && !analyticsComplete) {
    analyticsComplete = true
    trackPlaybackEvent('VIDEO_COMPLETE')
  }
  flushWatchTime()
  if (analyticsTimer) window.clearInterval(analyticsTimer)
  analyticsTimer = null
  analyticsLastTickAt = 0
}

const parseHeaders = (rawHeaders?: CustomHeaders | string | null): Record<string, string> => {
  if (!rawHeaders) return {}
  if (typeof rawHeaders === 'object') return rawHeaders as Record<string, string>
  try {
    return JSON.parse(rawHeaders)
  } catch {
    return {}
  }
}

/**
 * Format seconds to mm:ss or hh:mm:ss
 */
const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60

  const pad = (n: number) => n.toString().padStart(2, '0')
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
  }
  return `${pad(mins)}:${pad(secs)}`
}

/**
 * Extract Surrit Video UUID if videoUrl matches surrit.com pattern
 */
const getSurritUuid = (url: string): string | null => {
  const match = url.match(/surrit\.com\/([a-f0-9-]{36})/)
  return match ? match[1] : null
}

/**
 * Handle mouse movement over player container to calculate Surrit seek sprite preview URL and grid crop position
 */
const handleContainerMouseMove = (e: MouseEvent) => {
  const container = e.currentTarget as HTMLElement
  const rect = container.getBoundingClientRect()
  const yFromBottom = rect.bottom - e.clientY

  // Check if progress bar preview is disabled globally or via props
  if (!globalSeekPreviewEnabled.value || props.enableSeekPreview === false) {
    hoveringProgress.value = false
    return
  }

  // Only activate hover tooltip when mouse is near bottom progress bar region (< 65px from bottom)
  if (yFromBottom > 65) {
    hoveringProgress.value = false
    return
  }

  const surritUuid = getSurritUuid(props.video.videoUrl || '')
  if (!surritUuid) {
    hoveringProgress.value = false
    return
  }

  const totalWidth = rect.width
  const currentX = Math.max(0, Math.min(totalWidth, e.clientX - rect.left))
  const percentage = currentX / totalWidth

  const totalDuration = (plyrInstance && plyrInstance.duration) ? plyrInstance.duration : 300
  const timeSeconds = percentage * totalDuration

  // Surrit seek sprite index formula (300 seconds per sprite image)
  const spriteIndex = Math.floor(timeSeconds / 300) + 1

  // 10x10 sprite grid calculation (100 thumbnails per 300s sprite sheet, 3s per thumbnail tile)
  const timeInSprite = timeSeconds - (spriteIndex - 1) * 300
  const tileIndex = Math.min(99, Math.max(0, Math.floor(timeInSprite / 3)))
  const col = tileIndex % 10
  const row = Math.floor(tileIndex / 10)

  // Background position percentage calculation for 10x10 grid (0% to 100% across 9 step gaps)
  const posX = (col / 9) * 100
  const posY = (row / 9) * 100
  spriteStyle.value = { posX, posY }

  const rawSpriteUrl = `https://surrit.com/${surritUuid}/seek/_${spriteIndex}.jpg`
  const customHeaders = parseHeaders(props.video.headers)
  const hasHeaders = Object.keys(customHeaders).length > 0

  // Proxy the seek sprite URL with the EXACT SAME headers as the video stream
  let proxiedSprite = `/api/v1/proxy/video?id=${props.video.id || ''}&url=${encodeURIComponent(rawSpriteUrl)}`
  if (hasHeaders) {
    proxiedSprite += `&headers=${encodeURIComponent(JSON.stringify(customHeaders))}`
  }

  hoverX.value = Math.max(90, Math.min(totalWidth - 90, currentX))
  hoverTime.value = timeSeconds
  currentSpriteUrl.value = proxiedSprite
  hoveringProgress.value = true
}

/**
 * Destroys Plyr player and HLS instance
 */
const cleanupPlayerInstances = () => {
  stopPlaybackAnalytics(false)
  resetPlaybackAnalytics()

  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  if (hlsInstance) {
    try {
      hlsInstance.destroy()
    } catch (e) {
      console.warn('HLS destroy warning:', e)
    }
    hlsInstance = null
  }

  if (plyrInstance) {
    try {
      plyrInstance.destroy()
    } catch (e) {
      console.warn('Plyr destroy warning:', e)
    }
    plyrInstance = null
  }

  // 清空 video src，避免旧流继续占用
  if (videoRef.value) {
    try {
      videoRef.value.pause()
      videoRef.value.removeAttribute('src')
      videoRef.value.load()
    } catch (e) { /* ignore */ }
  }
}

/**
 * Main Video Loader — 直接流式播放
 * 后端代理已处理所有自定义 headers，客户端直接将代理 URL 赋给 video.src，
 * 浏览器通过原生 Range 请求实现分片流式播放，无需全量下载。
 */
const loadVideoToMemory = async () => {
  cleanupPlayerInstances()
  // 新视频/重新加载：重置手动暂停标记，允许本次自动播放
  userPaused.value = false

  // 标记已开始，切换到 loading UI
  hasStarted.value = true
  loading.value = true
  progress.value = 0
  errorMessage.value = null
  // 注意：不重置 videoAspectRatio —— 保留封面(poster)提供的比例，
  // 直到视频元数据到达后再由 handleLoadedMetadata 更新。
  // 否则激活瞬间容器会跳回 16:9 横屏，导致 loading overlay 恢复横屏比例（非预期行为）。

  const { video } = props
  if (!video || !video.videoUrl) {
    errorMessage.value = t('player.invalidUrl')
    loading.value = false
    return
  }

  const customHeaders = parseHeaders(video.headers)
  const cleanUrl = video.videoUrl.trim()
  const isM3u8 = cleanUrl.includes('.m3u8')
  const hasHeaders = Object.keys(customHeaders).length > 0

  // 构建后端代理 URL（后端负责注入所有自定义 headers）
  const deviceId = localStorage.getItem('mp_device_id') || ''
  const params = new URLSearchParams()
  if (video.id) params.append('id', video.id)
  if (deviceId) params.append('deviceId', deviceId)
  params.append('url', cleanUrl)
  if (hasHeaders) params.append('headers', JSON.stringify(customHeaders))
  const proxyUrl = `/api/v1/proxy/video?${params.toString()}`

  console.log(`[StreamPlayer] 模式: ${isM3u8 ? 'HLS' : 'MP4 直接流'} | URL: ${proxyUrl}`)

  if (!videoRef.value) {
    errorMessage.value = t('player.initFailed')
    loading.value = false
    return
  }

  // ── Case A: HLS (.m3u8) → hls.js 分片流 ────────────────────────────────────
  if (isM3u8) {
    loading.value = false
    progress.value = 100

    const hlsEl = videoRef.value

    // HLS 就绪后自动播放
    const onHlsCanPlay = () => {
      if (props.active && plyrInstance) {
        try { plyrInstance.play() } catch {}
      }
    }
    hlsEl.addEventListener('canplay', onHlsCanPlay, { once: true })

    if (Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        manifestLoadingTimeOut: 60000,
        manifestLoadingMaxRetry: 6,
        levelLoadingTimeOut: 60000,
        fragLoadingTimeOut: 60000
      })
      hlsInstance.loadSource(proxyUrl)
      hlsInstance.attachMedia(hlsEl)
    } else if (hlsEl.canPlayType('application/vnd.apple.mpegurl')) {
      hlsEl.src = proxyUrl
    }

    initializePlyr()
    emit('loaded', proxyUrl)
    return
  }

  // ── Case B: MP4 → 直接赋值 video.src，浏览器 Range 请求分片流 ──────────────
  // loading 状态由 video 事件驱动
  const el = videoRef.value

  const onCanPlay = () => {
    loading.value = false
    progress.value = 100
    // 缓冲就绪后自动播放（如果当前仍是激活状态）
    if (props.active && plyrInstance) {
      nextTick(() => {
        try { plyrInstance!.play() } catch {}
      })
    }
    el.removeEventListener('canplay', onCanPlay)
    el.removeEventListener('error', onError)
  }

  const onProgress = () => {
    // 用 buffered 范围计算已缓冲百分比用于进度条显示
    if (el.buffered.length > 0 && el.duration > 0) {
      const bufferedEnd = el.buffered.end(el.buffered.length - 1)
      progress.value = Math.min(99, (bufferedEnd / el.duration) * 100)
    }
  }

  const onError = () => {
    errorMessage.value = t('player.loadFailed')
    loading.value = false
    el.removeEventListener('canplay', onCanPlay)
    el.removeEventListener('progress', onProgress)
    el.removeEventListener('error', onError)
    emit('error', new Error('Video load error'))
  }

  el.addEventListener('canplay', onCanPlay, { once: true })
  el.addEventListener('progress', onProgress)
  el.addEventListener('error', onError, { once: true })

  // 直接赋值代理 URL，浏览器自动发 Range 请求，立即开始缓冲
  el.src = proxyUrl
  el.load()

  initializePlyr()
  emit('loaded', proxyUrl)
}

/**
 * Initializes Plyr UI player instance
 */
const initializePlyr = () => {
  if (!videoRef.value) return

  plyrInstance = new Plyr(videoRef.value, {
    autoplay: props.autoplay,
    loop: { active: props.loop },
    muted: props.muted,
    controls: [
      'play-large',
      'play',
      'progress',
      'current-time',
      'duration',
      'fullscreen'
    ],
    tooltips: { controls: true, seek: true }
  })

  plyrInstance.on('ready', () => {
    handleLoadedMetadata()
    // 同步初始音量状态到自定义控件
    volume.value = plyrInstance ? plyrInstance.volume : 1
    currentMuted.value = plyrInstance ? plyrInstance.muted : props.muted
  })

  plyrInstance.on('play', () => {
    userPaused.value = false // 用户主动播放（或自动恢复）→ 解除手动暂停标记
    startPlaybackAnalytics()
    emit('request-activate')
    emit('play')
  })
  plyrInstance.on('pause', () => {
    // 非程序性暂停 = 用户手动点击暂停 → 标记，禁止后续自动播放
    if (!programmaticPause) userPaused.value = true
    programmaticPause = false
    tickWatchTime()
    flushWatchTime()
    emit('pause')
  })
  plyrInstance.on('ended', () => {
    stopPlaybackAnalytics(true)
    resetPlaybackAnalytics()
  })

  let trialTriggered = false
  plyrInstance.on('timeupdate', () => {
    trackPlaybackProgress()
    if (props.video && props.video.isVip && !props.isVipUnlocked) {
      const limit = props.previewDuration || props.video.previewDuration || 120
      if (plyrInstance && plyrInstance.currentTime >= limit) {
        programmaticPause = true // 试看结束的强制暂停不计为用户手动暂停
        plyrInstance.pause()
        setTimeout(() => { programmaticPause = false }, 0)
        plyrInstance.currentTime = limit
        if (!trialTriggered) {
          trialTriggered = true
          emit('trial-ended', limit)
        }
      } else {
        trialTriggered = false
      }
    }
  })
}

/**
 * 用户手动点击封面播放按钮 → 请求激活并开始加载
 */
const onManualPlay = () => {
  emit('request-activate')
  // 如果已经是 active 状态（自己就是激活的），直接开始加载
  if (props.active) {
    userPaused.value = false // 用户主动播放
    hasStarted.value = true
    loadVideoToMemory()
  }
  // 否则等 watch(active) 监听到 true 后再开始
}

// ── 自定义竖向音量控件 ──────────────────────────────────────
const toggleVolumePanel = () => {
  volOpen.value = !volOpen.value
}

const toggleMute = () => {
  if (!plyrInstance) return
  plyrInstance.muted = !plyrInstance.muted
  currentMuted.value = plyrInstance.muted
}

const onVolumeInput = (e) => {
  if (!plyrInstance) return
  const v = Number(e.target.value)
  plyrInstance.volume = v
  volume.value = v
  if (v > 0 && plyrInstance.muted) {
    plyrInstance.muted = false
    currentMuted.value = false
  }
}

// 当 active 变化时协调加载/暂停
watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      if (!hasStarted.value) {
        // 首次激活 → 开始加载
        hasStarted.value = true
        nextTick(() => loadVideoToMemory())
      } else if (!loading.value && plyrInstance) {
        // 已加载就绪，从暂停恢复
        try { plyrInstance.play() } catch {}
      }
      // 若 loading.value=true，说明正在加载中，let it continue
    } else {
      // 停用：中止进行中的拉流
      if (currentAbortController) {
        currentAbortController.abort()
        currentAbortController = null
      }
      if (loading.value) {
        // 还在加载中被停用 → 回到 idle 封面状态（不卡 spinner）
        loading.value = false
        hasStarted.value = false
        cleanupPlayerInstances()
      } else if (plyrInstance) {
        // 已就绪 → 仅暂停，保留 hasStarted（滚回来可继续）
        programmaticPause = true // 停用导致的暂停不计为用户手动暂停（防误标 userPaused 卡封面）
        try { plyrInstance.pause() } catch {}
        setTimeout(() => { programmaticPause = false }, 0) // 延迟复位：覆盖异步 pause 事件窗口
      }
    }
  }
)

// 视频 URL 变化时重新加载（仅在激活状态下）
watch(
  () => [props.video.videoUrl, props.video.headers],
  () => {
    if (props.active) {
      loadVideoToMemory()
    }
  },
  { deep: true }
)

const fetchGlobalSettings = async () => {
  try {
    const res = await fetch('/api/v1/settings')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data && typeof json.data.enableSeekPreview === 'boolean') {
        globalSeekPreviewEnabled.value = json.data.enableSeekPreview
      }
    }
  } catch {
    // Fallback default true
  }
}

onMounted(() => {
  fetchGlobalSettings()
  // 第一个视频（active=true）立即激活
  if (props.active) {
    hasStarted.value = true
    loadVideoToMemory()
  }
  // 其他视频保持 idle 状态，等待 IntersectionObserver 或手动点击激活
})

onUnmounted(() => {
  cleanupPlayerInstances()
})
</script>

<style>
.plyr {
  width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
}

.plyr--full-ui {
  --plyr-color-main: #eab308;
  --plyr-video-control-color: #ffffff;
  --plyr-video-control-color-hover: #eab308;
  border-radius: 0.75rem;
  overflow: hidden;
  width: 100% !important;
  height: 100% !important;
}

.plyr--video {
  height: 100% !important;
}

.plyr__video-wrapper {
  height: 100% !important;
  width: 100% !important;
}

.plyr__video-wrapper video {
  height: 100% !important;
  width: 100% !important;
  object-fit: contain !important;
}

.plyr__poster {
  background-size: cover !important;
  background-position: center !important;
}

/* 竖向音量条 */
.vol-range {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 4px;
  height: 72px;
  accent-color: #eab308;
  cursor: pointer;
}

.plyr__control--overlaid {
  background: rgba(234, 179, 8, 0.9) !important;
  color: #000000 !important;
}

.plyr__control--overlaid:hover {
  background: #f59e0b !important;
}
</style>
