<template>
  <section class="bg-zinc-900/70 border border-zinc-800/70 rounded-2xl p-5 flex flex-col gap-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-black text-white flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-yellow-500">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
        {{ t('comment.title') }}
        <span v-if="total" class="text-[10px] font-mono text-zinc-500">{{ total }}</span>
      </h3>
    </div>

    <!-- 输入区：未登录显示登录引导 -->
    <div v-if="!currentUser" class="flex items-center justify-between gap-3 bg-zinc-950/60 border border-dashed border-zinc-700/70 rounded-xl px-4 py-3.5">
      <span class="text-xs text-zinc-500">{{ t('comment.loginPrompt') }}</span>
      <button
        @click="openAuth"
        class="shrink-0 px-4 py-1.5 bg-gradient-to-r from-yellow-500 to-amber-600 text-black text-xs font-black rounded-full shadow transition-all hover:scale-105 active:scale-95"
      >
        {{ t('auth.login') }}
      </button>
    </div>
    <div v-else class="flex flex-col gap-2.5">
      <textarea
        v-model="draft"
        rows="2"
        maxlength="500"
        :placeholder="t('comment.placeholder')"
        class="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-yellow-500/60 focus:ring-1 focus:ring-yellow-500/30 transition-all"
      />
      <div class="flex items-center justify-between">
        <span class="text-[10px] text-zinc-600 font-mono">{{ draft.length }}/500</span>
        <button
          @click="submitComment"
          :disabled="submitting || !draft.trim()"
          class="px-5 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 disabled:opacity-50 text-black text-xs font-black rounded-full shadow transition-all active:scale-95"
        >
          {{ submitting ? t('comment.submitting') : t('comment.submit') }}
        </button>
      </div>
      <p v-if="formError" class="text-xs text-red-400 font-medium">{{ formError }}</p>
    </div>

    <!-- 评论列表 -->
    <div v-if="loading" class="flex flex-col gap-3">
      <div v-for="n in 3" :key="n" class="flex gap-3 animate-pulse">
        <div class="w-8 h-8 rounded-full bg-zinc-800 shrink-0"></div>
        <div class="flex-1 flex flex-col gap-2">
          <div class="h-3 bg-zinc-800 rounded w-1/3"></div>
          <div class="h-3 bg-zinc-800/60 rounded w-2/3"></div>
        </div>
      </div>
    </div>

    <div v-else-if="items.length" class="flex flex-col divide-y divide-zinc-800/60">
      <div v-for="c in items" :key="c.id" class="py-3.5 flex gap-3">
        <img
          :src="c.avatar || defaultAvatar"
          class="w-8 h-8 rounded-full object-cover border border-zinc-700 shrink-0"
          alt=""
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-bold text-zinc-200">{{ c.nickname || t('comment.anonymous') }}</span>
            <span class="text-[10px] text-zinc-600">{{ formatTime(c.createdAt) }}</span>
            <button
              v-if="currentUser && currentUser.id === c.userId"
              @click="removeComment(c)"
              class="ml-auto text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
            >
              {{ t('comment.delete') }}
            </button>
          </div>
          <p class="text-sm text-zinc-300 leading-relaxed mt-1.5 break-words whitespace-pre-line">{{ c.content }}</p>
        </div>
      </div>

      <button
        v-if="hasMore"
        @click="loadMore"
        class="mt-2 py-2 text-xs text-zinc-500 hover:text-yellow-400 transition-colors"
      >
        {{ t('comment.loadMore') }}
      </button>
    </div>

    <div v-else class="py-6 text-center text-xs text-zinc-600">
      {{ t('comment.empty') }}
    </div>
  </section>
</template>

<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { authService } from '../services/authService'

const props = defineProps({
  videoId: { type: String, required: true }
})

const { t } = useI18n()
const { currentUser, openAuth, refreshUser } = inject('user')

const defaultAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop'

const items = ref([])
const total = ref(0)
const page = ref(1)
const hasMore = ref(false)
const loading = ref(true)
const draft = ref('')
const submitting = ref(false)
const formError = ref('')
const LIMIT = 20

const fetchComments = async (pageNum = 1, append = false) => {
  try {
    const res = await fetch(`/api/v1/videos/${props.videoId}/comments?page=${pageNum}&limit=${LIMIT}`)
    if (res.ok) {
      const json = await res.json()
      const d = json?.data
      if (d) {
        items.value = append ? [...items.value, ...d.items] : d.items
        total.value = d.total
        page.value = d.page
        hasMore.value = d.page < d.totalPages
      }
    }
  } catch (e) {
    console.warn('Comments fetch failed:', e)
  } finally {
    loading.value = false
  }
}

const loadMore = () => fetchComments(page.value + 1, true)

const submitComment = async () => {
  formError.value = ''
  const content = draft.value.trim()
  if (!content) return
  submitting.value = true
  try {
    const res = await fetch(`/api/v1/videos/${props.videoId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authService.getToken()}`
      },
      body: JSON.stringify({ content })
    })
    const json = await res.json().catch(() => null)
    if (res.ok && json?.data) {
      items.value = [json.data, ...items.value]
      total.value += 1
      draft.value = ''
    } else {
      formError.value = json?.message || t('comment.failed')
      // 401 → 会话失效，刷新用户态（会清 token）
      if (res.status === 401) refreshUser()
    }
  } finally {
    submitting.value = false
  }
}

const removeComment = async (c) => {
  try {
    const res = await fetch(`/api/v1/comments/${c.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authService.getToken()}` }
    })
    if (res.ok) {
      items.value = items.value.filter(x => x.id !== c.id)
      total.value = Math.max(0, total.value - 1)
    }
  } catch (e) {
    console.warn('Comment delete failed:', e)
  }
}

const formatTime = (iso) => {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('comment.time.justNow')
  if (min < 60) return t('comment.time.minutes', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('comment.time.hours', { n: hr })
  const day = Math.floor(hr / 24)
  if (day < 7) return t('comment.time.days', { n: day })
  return new Date(iso).toLocaleDateString()
}

onMounted(() => fetchComments())
</script>
