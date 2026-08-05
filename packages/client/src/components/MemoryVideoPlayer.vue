<template>
  <div 
    class="relative w-full h-full bg-black rounded-xl overflow-hidden group shadow-2xl transition-all duration-300 flex items-center justify-center max-h-[75vh]"
    :style="{ aspectRatio: videoAspectRatio }"
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

    <!-- Loading Overlay with Progress Bar -->
    <div 
      v-else-if="loading" 
      class="absolute inset-0 z-30 bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
    >
      <div class="relative w-16 h-16 mb-4 flex items-center justify-center">
        <!-- Circular Spinner -->
        <svg class="animate-spin w-full h-full text-yellow-500/20" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="absolute font-mono text-xs font-bold text-yellow-400">
          {{ Math.round(progress) }}%
        </span>
      </div>

      <div class="flex flex-col gap-1 items-center max-w-xs">
        <h5 class="text-sm font-bold text-white tracking-wide">正在安全拉取视频流数据</h5>
        <p class="text-[11px] text-zinc-400">正在快速加载，请稍候</p>
      </div>

      <!-- Download Progress Bar -->
      <div class="w-48 h-1.5 bg-zinc-800 rounded-full mt-4 overflow-hidden border border-zinc-700/50">
        <div 
          class="h-full bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 transition-all duration-200"
          :style="{ width: `${progress}%` }"
        ></div>
      </div>
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
        重新拉取
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Plyr from 'plyr'
import Hls from 'hls.js'
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
}

const props = withDefaults(defineProps<ComponentProps>(), {
  autoplay: false,
  loop: false,
  muted: true,
  enableSeekPreview: true,
  isVipUnlocked: false,
  active: true
})

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

/** 是否已开始拉流（false = idle 状态，展示封面+播放按钮） */
const hasStarted = ref<boolean>(false)

// Aspect Ratio State for Landscape / Portrait Auto Adaptation
const videoAspectRatio = ref<string>('16 / 9')
const isPortrait = ref<boolean>(false)

/**
 * Handle video loadedmetadata to detect resolution and aspect ratio dynamically
 */
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

  // 标记已开始，切换到 loading UI
  hasStarted.value = true
  loading.value = true
  progress.value = 0
  errorMessage.value = null
  videoAspectRatio.value = '16 / 9'
  isPortrait.value = false

  const { video } = props
  if (!video || !video.videoUrl) {
    errorMessage.value = '视频 URL 无效'
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
    errorMessage.value = '播放器初始化失败'
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
    errorMessage.value = '视频加载失败，请重试'
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
      'mute',
      'volume',
      'fullscreen'
    ],
    tooltips: { controls: true, seek: true }
  })

  plyrInstance.on('ready', () => {
    handleLoadedMetadata()
  })

  plyrInstance.on('play', () => {
    emit('request-activate')
    emit('play')
  })
  plyrInstance.on('pause', () => emit('pause'))

  let trialTriggered = false
  plyrInstance.on('timeupdate', () => {
    if (props.video && props.video.isVip && !props.isVipUnlocked) {
      const limit = props.previewDuration || props.video.previewDuration || 120
      if (plyrInstance && plyrInstance.currentTime >= limit) {
        plyrInstance.pause()
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
    hasStarted.value = true
    loadVideoToMemory()
  }
  // 否则等 watch(active) 监听到 true 后再开始
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
        try { plyrInstance.pause() } catch {}
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

.plyr__control--overlaid {
  background: rgba(234, 179, 8, 0.9) !important;
  color: #000000 !important;
}

.plyr__control--overlaid:hover {
  background: #f59e0b !important;
}
</style>
