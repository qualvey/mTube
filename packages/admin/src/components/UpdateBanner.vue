<template>
  <Transition name="update-fade">
    <div
      v-if="v.outdated"
      class="fixed top-0 inset-x-0 z-[80] bg-gradient-to-r from-yellow-500 to-amber-500 text-black shadow-lg"
      role="status"
    >
      <div class="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0">
            <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM3.75 12a.75.75 0 01-.75.75H.75a.75.75 0 010-1.5H3a.75.75 0 01.75.75zM6.166 5.106a.75.75 0 00-1.06 1.06l1.59 1.591a.75.75 0 001.061-1.06l-1.59-1.591z" />
          </svg>
          <span class="text-xs sm:text-sm font-semibold truncate">发现新版本，点击立即刷新</span>
        </div>
        <button
          class="shrink-0 rounded-full bg-black text-white text-xs font-bold px-3 py-1 hover:bg-zinc-800 transition-colors active:scale-95"
          @click="reload"
        >
          立即刷新
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useVersion } from '../services/versionService'

const v = useVersion()

const reload = () => {
  window.location.reload()
}
</script>

<style scoped>
.update-fade-enter-active,
.update-fade-leave-active {
  transition: all 0.3s ease;
}

.update-fade-enter-from,
.update-fade-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
