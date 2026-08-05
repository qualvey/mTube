<template>
  <div class="relative w-full h-screen bg-zinc-950 flex flex-col justify-end overflow-hidden transition-all duration-1000" :class="{ 'blur-md brightness-50': blur }">
    
    <!-- Hero Image / GIF Placeholder -->
    <div class="absolute inset-0 z-0">
      <img 
        :src="heroImageUrl" 
        alt="Hero Content" 
        class="w-full h-full object-cover object-center opacity-80"
      />
      <!-- Gradient Overlay for text legibility -->
      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
    </div>

    <!-- Content Overlay -->
    <div class="relative z-10 w-full p-6 pb-20 flex flex-col items-center text-center">
      <h1 class="text-4xl font-extrabold text-white mb-2 drop-shadow-lg">{{ heroTitle }}</h1>
      <p class="text-zinc-300 text-sm mb-10 drop-shadow">{{ heroSubtitle }}</p>
      
      <!-- Scroll Indicator -->
      <div class="flex flex-col items-center animate-bounce">
        <span class="text-xs text-white/50 mb-2 uppercase tracking-widest">{{ t('hero.swipeUp') }}</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6 text-white/70">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCurrentLocale, LOCALE_CHANGED_EVENT } from '../i18n'

const { t } = useI18n()

defineProps({
  blur: {
    type: Boolean,
    default: false
  }
})

const DEFAULT_HERO_IMAGE = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop'
const heroImageUrl = ref(DEFAULT_HERO_IMAGE)
const heroTitle = ref(t('hero.defaultTitle'))
const heroSubtitle = ref(t('hero.defaultSubtitle'))

const fetchHeroSettings = async () => {
  try {
    const lang = getCurrentLocale()
    const res = await fetch(`/api/v1/settings?lang=${lang}`)
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        if (json.data.heroImageUrl) heroImageUrl.value = json.data.heroImageUrl
        if (json.data.heroTitle) heroTitle.value = json.data.heroTitle
        if (json.data.heroSubtitle) heroSubtitle.value = json.data.heroSubtitle
      }
    }
  } catch (e) {
    console.warn('Failed to load hero settings:', e)
  }
}

onMounted(() => {
  fetchHeroSettings()
  window.addEventListener(LOCALE_CHANGED_EVENT, fetchHeroSettings)
})

onUnmounted(() => {
  window.removeEventListener(LOCALE_CHANGED_EVENT, fetchHeroSettings)
})
</script>
