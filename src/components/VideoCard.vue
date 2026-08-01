<template>
  <div 
    ref="cardRef" 
    class="relative w-full rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-2xl transition-all duration-300 hover:border-zinc-700/80"
  >
    <!-- Video Player Area -->
    <div class="relative w-full aspect-video bg-black group overflow-hidden">
      <!-- Video Element -->
      <video
        ref="videoRef"
        :src="video.videoUrl"
        :poster="video.poster"
        playsinline
        loop
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
        @click="togglePlay"
      ></video>

      <!-- VIP Badge (Top Left) -->
      <div 
        v-if="video.isVip" 
        class="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-black text-xs font-black shadow-lg flex items-center gap-1 animate-pulse"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5">
          <path fill-rule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clip-rule="evenodd" />
        </svg>
        <span>VIP 独家原画</span>
      </div>

      <!-- Duration Badge (Top Right) -->
      <div class="absolute top-3 right-3 z-20 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-white text-[11px] font-mono border border-white/10">
        {{ video.duration }}
      </div>

      <!-- VIP Locked Overlay when clicked/locked -->
      <div 
        v-if="video.isVip && !isPlaying" 
        class="absolute inset-0 z-10 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-opacity"
        @click="onVipClick"
      >
        <div class="w-12 h-12 rounded-full bg-yellow-500/20 border border-yellow-500/50 flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(234,179,8,0.4)]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-yellow-400">
            <path fill-rule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clip-rule="evenodd" />
          </svg>
        </div>
        <p class="text-white text-sm font-bold drop-shadow">此视频为 VIP 专属内容</p>
        <button 
          class="mt-3 px-4 py-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-black rounded-full shadow-md hover:scale-105 active:scale-95 transition-all"
        >
          立即解锁观看
        </button>
      </div>

      <!-- Big Play Button Overlay (when paused & non-VIP or normal) -->
      <div 
        v-if="!isPlaying && (!video.isVip || isVipUnlocked)" 
        class="absolute inset-0 z-10 flex items-center justify-center bg-black/30 cursor-pointer transition-opacity"
        @click="togglePlay"
      >
        <div class="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xl hover:scale-110 active:scale-90 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7 translate-x-0.5">
            <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
          </svg>
        </div>
      </div>

      <!-- Video Control Bar (Bottom Overlay) -->
      <div class="absolute inset-x-0 bottom-0 z-20 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
        <!-- Progress Bar -->
        <div class="relative w-full h-1 bg-white/30 rounded cursor-pointer overflow-hidden group/bar" @click="seek">
          <div 
            class="h-full bg-gradient-to-r from-red-500 to-yellow-500 transition-all duration-100" 
            :style="{ width: `${progress}%` }"
          ></div>
        </div>

        <!-- Controls Row -->
        <div class="flex items-center justify-between text-white text-xs pt-1">
          <div class="flex items-center gap-3">
            <!-- Play/Pause Mini Toggle -->
            <button @click="togglePlay" class="hover:text-yellow-400 transition-colors">
              <svg v-if="isPlaying" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
              </svg>
            </button>

            <!-- Mute/Unmute Toggle -->
            <button @click="toggleMute" class="hover:text-yellow-400 transition-colors">
              <svg v-if="isMuted" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 text-red-400">
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.5A2.25 2.25 0 002.25 9.75v4.5A2.25 2.25 0 004.5 16.5h1.94l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 101.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06l-1.72 1.72-1.72-1.72z" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.5A2.25 2.25 0 002.25 9.75v4.5A2.25 2.25 0 004.5 16.5h1.94l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
              </svg>
            </button>

            <!-- Time Display -->
            <span class="font-mono text-[11px] text-zinc-400">
              {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
            </span>
          </div>

          <!-- Fullscreen Toggle -->
          <button @click="toggleFullscreen" class="hover:text-yellow-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
              <path fill-rule="evenodd" d="M3.75 3.75a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-3v3a.75.75 0 01-1.5 0v-3.75zm0 16.5a.75.75 0 01.75-.75h3a.75.75 0 010 1.5h-3v-3a.75.75 0 01-.75-.75zm16.5-16.5a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0v-3h-3a.75.75 0 010-1.5h4.5zm.75 16.5a.75.75 0 01-.75.75h-4.5a.75.75 0 010-1.5h3v-3a.75.75 0 011.5 0v4.5z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Video Info & Meta Area -->
    <div class="p-4 flex flex-col gap-3">
      <!-- Title & Tags -->
      <div>
        <div class="flex items-center gap-2 mb-1.5 flex-wrap">
          <span 
            v-for="tag in video.tags" 
            :key="tag"
            class="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] font-medium rounded-md border border-zinc-700/50"
          >
            #{{ tag }}
          </span>
        </div>
        <h4 class="text-base font-bold text-white leading-snug line-clamp-2 hover:text-yellow-400 transition-colors cursor-pointer" @click="togglePlay">
          {{ video.title }}
        </h4>
        <p class="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
          {{ video.description }}
        </p>
      </div>

      <!-- Author Row & Action Buttons -->
      <div class="flex items-center justify-between pt-2 border-t border-zinc-800/60">
        <!-- Author Profile -->
        <div class="flex items-center gap-2.5">
          <img 
            :src="video.authorAvatar" 
            :alt="video.author" 
            class="w-8 h-8 rounded-full object-cover border border-zinc-700 shadow"
          />
          <div class="flex flex-col">
            <span class="text-xs font-semibold text-zinc-200">{{ video.author }}</span>
            <span class="text-[10px] text-zinc-500">官方认证创作者</span>
          </div>
        </div>

        <!-- Interactive Buttons (Like, Share, Paywall Lock) -->
        <div class="flex items-center gap-3">
          <!-- Like Button -->
          <button 
            @click="handleLike" 
            class="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-500 transition-colors active:scale-90"
            :class="{ 'text-red-500 font-bold': isLiked }"
          >
            <svg xmlns="http://www.w3.org/2000/svg" :viewBox="isLiked ? '0 0 24 24' : '0 0 24 24'" :fill="isLiked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            <span>{{ formatCount(likesCount) }}</span>
          </button>

          <!-- Share Button -->
          <button class="flex items-center gap-1 text-xs text-zinc-400 hover:text-yellow-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
            <span>{{ video.shares }}</span>
          </button>

          <!-- VIP Unlock Button (if VIP) -->
          <button 
            v-if="video.isVip"
            @click="onVipClick"
            class="px-3 py-1 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black text-xs font-black rounded-lg shadow-md active:scale-95 transition-all"
          >
            解锁完整版
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { videoService } from '../services/videoService'

const props = defineProps({
  video: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['trigger-paywall'])

const cardRef = ref(null)
const videoRef = ref(null)

const isPlaying = ref(false)
const isMuted = ref(true)
const currentTime = ref(0)
const duration = ref(0)
const progress = ref(0)
const isLiked = ref(props.video.isLiked)
const likesCount = ref(props.video.likes)
const isVipUnlocked = ref(false)

let observer = null

onMounted(() => {
  // Setup IntersectionObserver for auto-play when in viewport
  if ('IntersectionObserver' in window && cardRef.value) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // Only auto-play if non-VIP or already unlocked
            if (!props.video.isVip || isVipUnlocked.value) {
              playVideo()
            }
          } else {
            pauseVideo()
          }
        })
      },
      { threshold: 0.5 }
    )
    observer.observe(cardRef.value)
  }
})

onUnmounted(() => {
  if (observer) observer.disconnect()
})

const playVideo = () => {
  if (!videoRef.value) return
  videoRef.value.muted = isMuted.value
  videoRef.value.play().then(() => {
    isPlaying.value = true
    videoService.trackVideoClick(props.video.id)
  }).catch(() => {
    isPlaying.value = false
  })
}


const pauseVideo = () => {
  if (!videoRef.value) return
  videoRef.value.pause()
  isPlaying.value = false
}

const togglePlay = () => {
  if (props.video.isVip && !isVipUnlocked.value) {
    onVipClick()
    return
  }

  if (isPlaying.value) {
    pauseVideo()
  } else {
    playVideo()
  }
}

const toggleMute = () => {
  isMuted.value = !isMuted.value
  if (videoRef.value) {
    videoRef.value.muted = isMuted.value
  }
}

const onVipClick = () => {
  pauseVideo()
  emit('trigger-paywall', props.video)
}

const onTimeUpdate = () => {
  if (!videoRef.value) return
  currentTime.value = videoRef.value.currentTime
  if (duration.value > 0) {
    progress.value = (currentTime.value / duration.value) * 100
  }
}

const onLoadedMetadata = () => {
  if (videoRef.value) {
    duration.value = videoRef.value.duration
  }
}

const seek = (e) => {
  if (!videoRef.value || duration.value <= 0) return
  const rect = e.currentTarget.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const newTime = (clickX / rect.width) * duration.value
  videoRef.value.currentTime = newTime
}

const toggleFullscreen = () => {
  if (!videoRef.value) return
  if (videoRef.value.requestFullscreen) {
    videoRef.value.requestFullscreen()
  } else if (videoRef.value.webkitRequestFullscreen) {
    videoRef.value.webkitRequestFullscreen()
  }
}

const handleLike = () => {
  isLiked.value = !isLiked.value
  likesCount.value += isLiked.value ? 1 : -1
}

const formatCount = (count) => {
  if (count >= 10000) {
    return (count / 10000).toFixed(1) + 'w'
  }
  return count
}

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const min = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}
</script>
