<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop with strong blur -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-xl"></div>
    
    <!-- Modal Content -->
    <div class="relative w-full max-w-sm bg-zinc-900/80 backdrop-blur-2xl border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center transform transition-all">
      
      <!-- Icon / Warning Sign -->
      <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
        <span class="text-red-500 text-2xl font-bold font-mono">18+</span>
      </div>
      
      <h2 class="text-2xl font-bold text-white mb-3">年龄确认</h2>
      
      <p class="text-zinc-400 text-sm mb-8 leading-relaxed">
        本站包含成人内容。<br>
        如果您未满 18 岁，或者您所在地区的法律禁止查看此类内容，请立即离开。
      </p>
      
      <div class="w-full flex flex-col gap-3">
        <button 
          @click="$emit('verified')"
          class="w-full py-3.5 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white rounded-xl font-bold text-[15px] shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all active:scale-95"
        >
          我已满 18 岁，进入
        </button>
        
        <button 
          @click="leaveSite"
          class="w-full py-3.5 bg-transparent border border-zinc-700 hover:bg-zinc-800 text-zinc-400 rounded-xl font-medium text-[15px] transition-all"
        >
          我未满 18 岁，离开
        </button>
      </div>
      
    </div>
  </div>
</template>

<script setup>
defineEmits(['verified'])

const leaveSite = () => {
  window.location.href = 'https://www.google.com'
}
</script>
