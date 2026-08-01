<template>
  <div class="fixed inset-x-0 bottom-0 z-40 w-full rounded-t-[2.5rem] overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
    <!-- Glassmorphism Background -->
    <div class="absolute inset-0 bg-zinc-900/70 backdrop-blur-3xl border-t border-zinc-700/50"></div>
    
    <div class="relative w-full px-6 py-8 pb-12 flex flex-col items-center">
      
      <!-- Drag Handle Indicator -->
      <div class="w-12 h-1.5 bg-zinc-600 rounded-full mb-6"></div>
      
      <h3 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500 mb-2">
        解锁完整版
      </h3>
      <p class="text-zinc-300 text-sm mb-6 text-center">
        由于政策及带宽成本原因，剩余 90% 的高清原片及无删减动图仅限 VIP 会员观看。
      </p>

      <!-- Pricing Options -->
      <div class="w-full flex flex-col gap-3 mb-8">
        <!-- Option 1: Monthly -->
        <label class="w-full relative flex items-center p-4 border-2 border-zinc-700 rounded-2xl cursor-pointer hover:border-yellow-500/50 transition-colors bg-zinc-800/40">
          <input type="radio" name="pricing" class="peer sr-only" value="monthly" checked />
          <div class="w-5 h-5 rounded-full border-2 border-zinc-500 peer-checked:border-yellow-500 peer-checked:bg-yellow-500 mr-4 flex items-center justify-center">
             <div class="w-2 h-2 rounded-full bg-black opacity-0 peer-checked:opacity-100"></div>
          </div>
          <div class="flex-1">
            <div class="font-bold text-white">包月 VIP</div>
            <div class="text-xs text-zinc-400">每日更新，尽享丝滑</div>
          </div>
          <div class="text-right">
            <div class="font-bold text-yellow-500 text-lg">¥39</div>
            <div class="text-xs text-zinc-500 line-through">¥59</div>
          </div>
          
          <!-- Selected border effect -->
          <div class="absolute inset-0 border-2 border-yellow-500 rounded-2xl opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity"></div>
        </label>
        
        <!-- Option 2: Lifetime (Highlighted) -->
        <label class="w-full relative flex items-center p-4 border-2 border-zinc-700 rounded-2xl cursor-pointer hover:border-yellow-500/50 transition-colors bg-gradient-to-r from-yellow-500/10 to-amber-500/5 overflow-hidden">
          <!-- Recommended Badge -->
          <div class="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
            限时特惠
          </div>

          <input type="radio" name="pricing" class="peer sr-only" value="lifetime" />
          <div class="w-5 h-5 rounded-full border-2 border-zinc-500 peer-checked:border-yellow-500 peer-checked:bg-yellow-500 mr-4 flex items-center justify-center">
             <div class="w-2 h-2 rounded-full bg-black opacity-0 peer-checked:opacity-100"></div>
          </div>
          <div class="flex-1">
            <div class="font-bold text-white">永久钻石 VIP</div>
            <div class="text-xs text-zinc-400">一次付费，终身受用</div>
          </div>
          <div class="text-right">
            <div class="font-bold text-yellow-500 text-lg">¥199</div>
            <div class="text-xs text-zinc-500 line-through">¥499</div>
          </div>
          
          <!-- Selected border effect -->
          <div class="absolute inset-0 border-2 border-yellow-500 rounded-2xl opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity"></div>
        </label>
      </div>

      <!-- Action Button -->
      <button class="w-full py-4 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-extrabold rounded-2xl shadow-[0_0_30px_rgba(234,179,8,0.3)] hover:scale-[1.02] active:scale-95 transition-all">
        立即解锁观影特权
      </button>
      
      <p class="text-zinc-500 text-[10px] mt-4 flex items-center gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        支付过程安全加密，平台不记录任何敏感信息
      </p>
    </div>
  </div>
</template>

<script setup>
defineEmits(['close'])
</script>
