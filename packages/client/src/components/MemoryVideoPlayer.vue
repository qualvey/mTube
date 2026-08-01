<template>
  <div 
    class="relative w-full h-full aspect-video bg-black rounded-xl overflow-hidden group shadow-2xl"
    @mousemove="handleContainerMouseMove"
    @mouseleave="hoveringProgress = false"
  >
    <!-- Loading Overlay with Progress Bar -->
    <div 
      v-if="loading" 
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
        <p class="text-[11px] text-zinc-400">注入自定义请求头 & 写入前端内存 ArrayBuffer / Blob</p>
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
        @click="loadVideoToMemory" 
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
      class="plyr-video-element w-full h-full object-cover"
    ></video>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
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
}

const props = withDefaults(defineProps<ComponentProps>(), {
  autoplay: false,
  loop: false,
  muted: true,
  enableSeekPreview: true,
  isVipUnlocked: false
})

const emit = defineEmits<{
  (e: 'loaded', objectUrl: string): void
  (e: 'error', error: Error): void
  (e: 'play'): void
  (e: 'pause'): void
  (e: 'trial-ended', limit: number): void
}>()

// Reactive States
const videoRef = ref<HTMLVideoElement | null>(null)
const loading = ref<boolean>(true)
const progress = ref<number>(0)
const errorMessage = ref<string | null>(null)

// Seek Hover Preview States
const hoveringProgress = ref<boolean>(false)
const hoverX = ref<number>(0)
const hoverTime = ref<number>(0)
const currentSpriteUrl = ref<string | null>(null)
const spriteStyle = ref<{ posX: number; posY: number }>({ posX: 0, posY: 0 })
const globalSeekPreviewEnabled = ref<boolean>(true)

let plyrInstance: Plyr | null = null
let hlsInstance: Hls | null = null
let activeObjectUrl: string | null = null
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
 * Safely revokes Object URL with a 1.5s grace period so Chrome media decoder never hits ERR_FILE_NOT_FOUND
 */
const safeRevokeObjectUrl = () => {
  if (activeObjectUrl) {
    const urlToRevoke = activeObjectUrl
    activeObjectUrl = null

    if (videoRef.value && videoRef.value.src === urlToRevoke) {
      videoRef.value.removeAttribute('src')
      try {
        videoRef.value.load()
      } catch (e) {
        // ignore
      }
    }

    setTimeout(() => {
      console.log(`[MemoryVideoPlayer Debug] 🗑️ Safely revoked Blob URL from RAM: ${urlToRevoke}`)
      URL.revokeObjectURL(urlToRevoke)
    }, 1500)
  }
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
}

/**
 * Main Video Loader with 5-Step Step-by-Step Debug Log Tracing
 */
const loadVideoToMemory = async () => {
  cleanupPlayerInstances()

  loading.value = true
  progress.value = 0
  errorMessage.value = null

  currentAbortController = new AbortController()

  const { video } = props
  if (!video || !video.videoUrl) {
    errorMessage.value = '视频 URL 无效'
    loading.value = false
    return
  }

  const customHeaders = parseHeaders(video.headers)
  const cleanUrl = video.videoUrl.trim()
  const isM3u8 = cleanUrl.includes('.m3u8')
  const isYoutube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')
  const hasHeaders = Object.keys(customHeaders).length > 0

  let fetchTargetUrl = cleanUrl
  const deviceId = localStorage.getItem('mp_device_id') || ''
  if (isYoutube || hasHeaders || video.id || isM3u8) {
    const params = new URLSearchParams()
    if (video.id) params.append('id', video.id)
    if (deviceId) params.append('deviceId', deviceId)
    params.append('url', cleanUrl)
    if (hasHeaders) params.append('headers', JSON.stringify(customHeaders))
    fetchTargetUrl = `/api/v1/proxy/video?${params.toString()}`
  }

  console.group(`[MemoryVideoPlayer Step-by-Step Debug] Video: ${video.id || 'N/A'}`)
  console.log(`[Step 1/5 - URL Prep] Target Fetch URL:`, fetchTargetUrl)
  console.log(`[Step 1/5 - Headers] Parsed Headers:`, customHeaders)
  console.log(`[Step 1/5 - Mode] Stream Mode: ${isM3u8 ? 'HLS Playlist (.m3u8)' : 'MP4 Direct Memory Blob'}`)

  // Case A: HLS Stream (.m3u8) -> Use hls.js with Plyr
  if (isM3u8) {
    console.log(`[Step 2/5 - HLS] Initializing Hls.js on proxy endpoint:`, fetchTargetUrl)
    if (!videoRef.value) {
      console.error(`[Step 2/5 - HLS] Failed: videoRef DOM element is null`)
      console.groupEnd()
      return
    }
    loading.value = false
    progress.value = 100

    if (Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        manifestLoadingTimeOut: 60000,
        manifestLoadingMaxRetry: 6,
        levelLoadingTimeOut: 60000,
        fragLoadingTimeOut: 60000
      })
      hlsInstance.loadSource(fetchTargetUrl)
      hlsInstance.attachMedia(videoRef.value)
      console.log(`[Step 3/5 - HLS] Hls.js source loaded & attached to HTML5 video element.`)
    } else if (videoRef.value.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.value.src = fetchTargetUrl
      console.log(`[Step 3/5 - HLS] Native Safari HLS src assigned:`, fetchTargetUrl)
    }

    console.log(`[Step 4/5 - HLS] Initializing Plyr UI player...`)
    initializePlyr()
    console.log(`[Step 5/5 - HLS] Success! HLS Player mounted and ready for playback.`)
    console.groupEnd()
    emit('loaded', fetchTargetUrl)
    return
  }

  // Case B: MP4 Stream -> Fetch into memory Blob -> Object URL
  try {
    console.log(`[Step 2/5 - Fetch] Initiating HTTP GET request to backend proxy...`)
    const response = await fetch(fetchTargetUrl, {
      method: 'GET',
      headers: customHeaders,
      signal: currentAbortController.signal
    })

    console.log(`[Step 2/5 - Response] HTTP Status: ${response.status} ${response.statusText}`)
    console.log(`[Step 2/5 - Response] Content-Type: ${response.headers.get('content-type')}`)
    console.log(`[Step 2/5 - Response] Content-Length: ${response.headers.get('content-length')} bytes`)

    if (!response.ok) {
      throw new Error(`HTTP 错误代码: ${response.status} ${response.statusText}`)
    }

    const contentLengthHeader = response.headers.get('content-length')
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0
    const contentType = response.headers.get('content-type') || 'video/mp4'

    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let receivedBytes = 0

    if (reader) {
      console.log(`[Step 3/5 - Stream] Reading stream chunks from response body...`)
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          receivedBytes += value.length
          if (totalBytes > 0) {
            progress.value = Math.min(100, (receivedBytes / totalBytes) * 100)
          } else {
            progress.value = Math.min(95, progress.value + 5)
          }
        }
      }
    } else {
      console.log(`[Step 3/5 - ArrayBuffer] Reading arrayBuffer directly...`)
      const arrayBuffer = await response.arrayBuffer()
      chunks.push(new Uint8Array(arrayBuffer))
      receivedBytes = arrayBuffer.byteLength
    }

    progress.value = 100
    console.log(`[Step 3/5 - Assembly] All chunks received! Total Chunks: ${chunks.length}, Total Size: ${(receivedBytes / 1024 / 1024).toFixed(2)} MB`)

    // Revoke previous Blob URL gracefully
    safeRevokeObjectUrl()

    console.log(`[Step 4/5 - Blob] Assembling new Blob({ type: '${contentType}' })...`)
    const videoBlob = new Blob(chunks, { type: contentType })

    console.log(`[Step 4/5 - ObjectURL] Calling URL.createObjectURL(videoBlob)...`)
    activeObjectUrl = URL.createObjectURL(videoBlob)

    console.log(`[Step 4/5 - ObjectURL] SUCCESS! Generated RAM Object URL:`, activeObjectUrl)

    if (!videoRef.value) {
      console.error(`[Step 5/5 - Mount] Failed: videoRef DOM element is null`)
      console.groupEnd()
      return
    }

    console.log(`[Step 5/5 - Mount] Assigning videoRef.src = '${activeObjectUrl}'`)
    videoRef.value.src = activeObjectUrl
    loading.value = false

    console.log(`[Step 5/5 - Plyr] Initializing Plyr UI player on video element...`)
    initializePlyr()

    console.log(`[Step 5/5 - Complete] Memory Video Stream player fully mounted and ready!`)
    console.groupEnd()
    emit('loaded', activeObjectUrl)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.log(`[Step X - Abort] Fetch request was aborted cleanly.`)
      console.groupEnd()
      safeRevokeObjectUrl()
      return
    }
    console.error(`[Step X - FAILED] Memory stream fetch failed:`, err)
    console.groupEnd()

    if (videoRef.value) {
      safeRevokeObjectUrl()
      videoRef.value.src = fetchTargetUrl
      loading.value = false
      initializePlyr()
      emit('loaded', fetchTargetUrl)
    } else {
      errorMessage.value = `视频加载失败: ${err.message}`
      loading.value = false
      emit('error', err)
    }
  }
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
    ratio: '16:9',
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

  plyrInstance.on('play', () => emit('play'))
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

watch(
  () => [props.video.videoUrl, props.video.headers],
  () => {
    loadVideoToMemory()
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
  loadVideoToMemory()
})

onUnmounted(() => {
  cleanupPlayerInstances()
  safeRevokeObjectUrl()
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
  object-fit: cover !important;
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
