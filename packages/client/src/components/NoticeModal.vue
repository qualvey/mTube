<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
    <div class="relative w-full max-w-sm rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-700/80 shadow-[0_0_50px_rgba(234,179,8,0.2)] flex flex-col transition-all transform scale-100">
      
      <!-- Top Decorative Banner -->
      <div class="w-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 p-5 text-black flex flex-col items-center justify-center text-center">
        <div class="w-12 h-12 rounded-full bg-black/10 flex items-center justify-center mb-2 shadow-inner">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7 text-black">
            <path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 3.75 3.75 0 01-4.832-1.244.75.75 0 01-.296-1.205A11.217 11.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clip-rule="evenodd" />
          </svg>
        </div>
        <h3 class="text-xl font-black drop-shadow-sm leading-snug">
          {{ title || '📢 官方重要公告' }}
        </h3>
      </div>

      <!-- Content Area -->
      <div class="p-6 flex flex-col gap-4 text-zinc-200 text-sm leading-relaxed max-h-[60vh] overflow-y-auto">
        <div class="whitespace-pre-line text-zinc-300 font-sans">
          {{ content }}
        </div>
      </div>

      <!-- Footer & Actions -->
      <div class="p-5 pt-0 flex flex-col gap-3">
        <!-- Do Not Show Today Checkbox -->
        <label class="flex items-center justify-center gap-2 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors">
          <input 
            type="checkbox" 
            v-model="doNotShowToday"
            class="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-zinc-900 cursor-pointer"
          />
          <span>今日不再提醒</span>
        </label>

        <!-- Close Button -->
        <button 
          @click="handleClose"
          class="w-full py-3.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-black font-extrabold rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all text-sm"
        >
          我知道了
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: '📢 官方重要公告'
  },
  content: {
    type: String,
    default: '欢迎来到 StreamVIP 独家流媒体平台！升级尊享 VIP 会员可无限制观看全站 4K 超清原片库！'
  }
})

const emit = defineEmits(['close'])
const doNotShowToday = ref(false)

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

const handleClose = () => {
  if (doNotShowToday.value) {
    const todayStr = new Date().toISOString().substring(0, 10)
    const noticeHash = getNoticeHash(props.title, props.content)
    localStorage.setItem('mp_notice_dismissed_date', todayStr)
    localStorage.setItem('mp_notice_dismissed_hash', noticeHash)
  }
  emit('close')
}
</script>
