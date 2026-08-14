<template>
  <div class="relative w-full rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-2xl">
    <!-- Ad Image -->
    <div class="relative w-full aspect-video bg-zinc-800 overflow-hidden">
      <img
        v-if="ad.imageUrl"
        :src="ad.imageUrl"
        :alt="ad.title"
        loading="lazy"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-zinc-600 text-xs font-bold">
        AD
      </div>
      <!-- 广告标识 -->
      <div class="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 text-white text-[10px] font-black tracking-widest">
        {{ t('ad.sponsored') }}
      </div>
    </div>

    <!-- Ad Body -->
    <div class="p-4 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="text-sm font-bold text-white line-clamp-2">{{ ad.title }}</div>
        <div class="text-[10px] text-zinc-500 mt-1">Sponsored</div>
      </div>
      <button
        v-if="ad.linkUrl"
        @click="handleClick"
        class="shrink-0 px-4 py-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-black rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
      >
        {{ t('ad.cta') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { trackEvent } from '../services/analyticsService'

const props = defineProps({
  ad: {
    type: Object,
    required: true
  }
})

const { t } = useI18n()

// 进入视口即计一次曝光
onMounted(() => {
  trackEvent('AD_IMPRESSION', { adId: props.ad.id, adType: props.ad.type || 'feed' })
})

const handleClick = () => {
  trackEvent('AD_CLICK', { adId: props.ad.id, adType: props.ad.type || 'feed', linkUrl: props.ad.linkUrl })
  if (props.ad.linkUrl) {
    window.open(props.ad.linkUrl, '_blank', 'noopener')
  }
}
</script>
