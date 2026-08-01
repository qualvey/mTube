<template>
  <div class="relative w-full h-[150vh] bg-black">
    <!-- Sticky Container to create parallax / reveal effect -->
    <div class="sticky top-0 w-full h-screen overflow-hidden flex items-center justify-center transition-all duration-700" :class="{ 'blur-xl brightness-50': blur }">
      
      <!-- Background Image that scales as we scroll -->
      <img 
        src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=1000&auto=format&fit=crop" 
        alt="Reveal Content"
        class="absolute inset-0 w-full h-full object-cover transition-transform duration-100 ease-out"
        :style="{ transform: `scale(${1 + progress * 0.5})`, opacity: progress + 0.2 }"
      />
      
      <div class="absolute inset-0 bg-black/40"></div>

      <!-- Text that fades in -->
      <div 
        class="relative z-10 text-center px-4 transition-opacity duration-300"
        :style="{ opacity: progress > 0.2 ? 1 : 0 }"
      >
        <h2 class="text-3xl font-bold text-white mb-2 shadow-black drop-shadow-xl" :style="{ transform: `translateY(${(1 - progress) * 50}px)` }">
          即将解锁...
        </h2>
        <p class="text-zinc-200">正在为您准备高清画集与独家视频</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  progress: {
    type: Number,
    required: true
  },
  blur: {
    type: Boolean,
    default: false
  }
})
</script>
