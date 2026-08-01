<template>
  <div class="relative w-full h-screen bg-zinc-950 flex flex-col justify-end overflow-hidden transition-all duration-1000" :class="{ 'blur-md brightness-50': blur }">
    
    <!-- Hero Image / GIF Placeholder (Using a beautiful unsplash image as placeholder) -->
    <div class="absolute inset-0 z-0">
      <img 
        src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop" 
        alt="Hero Content" 
        class="w-full h-full object-cover object-center opacity-80"
      />
      <!-- Gradient Overlay for text legibility -->
      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
    </div>

    <!-- Content Overlay -->
    <div class="relative z-10 w-full p-6 pb-20 flex flex-col items-center text-center">
      <h1 class="text-4xl font-extrabold text-white mb-2 drop-shadow-lg">极致诱惑</h1>
      <p class="text-zinc-300 text-sm mb-10 drop-shadow">滑动探索更多独家无删减内容</p>
      
      <!-- Scroll Indicator -->
      <div class="flex flex-col items-center animate-bounce">
        <span class="text-xs text-white/50 mb-2 uppercase tracking-widest">Swipe Up</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6 text-white/70">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  blur: {
    type: Boolean,
    default: false
  }
})
</script>
