<template>
  <div 
    class="fixed inset-x-0 bottom-0 z-40 w-full rounded-t-[2.5rem] overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)] touch-pan-y transition-transform duration-200 ease-out max-h-[92vh] flex flex-col"
    :style="{ transform: translateY > 0 ? `translateY(${translateY}px)` : 'none' }"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @mousedown="onMouseDown"
  >
    <!-- Glassmorphism Background -->
    <div class="absolute inset-0 bg-zinc-900/90 backdrop-blur-3xl border-t border-zinc-700/50"></div>
    
    <div class="relative w-full px-6 py-6 pb-10 flex flex-col items-center overflow-y-auto">
      
      <!-- Close Button (Top Right) -->
      <button 
        @click="$emit('close')"
        class="absolute top-4 right-5 w-8 h-8 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white flex items-center justify-center border border-zinc-700/50 transition-colors z-50 active:scale-95"
      >
        ✕
      </button>

      <!-- Swipe Down Indicator Hint -->
      <div 
        @click="$emit('close')"
        class="flex flex-col items-center cursor-pointer mb-3 group"
      >
        <div class="w-12 h-1.5 bg-zinc-500/80 group-hover:bg-yellow-400 rounded-full transition-colors mb-1"></div>
        <div class="flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-yellow-400 transition-colors animate-bounce">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-yellow-400">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
          <span class="font-medium">{{ t('paywall.swipeDown') }}</span>
        </div>
      </div>
      
      <h3 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500 mb-1 text-center">
        {{ t('paywall.title') }}
      </h3>
      <p class="text-zinc-400 text-xs mb-5 text-center">
        {{ t('paywall.subtitle') }}
      </p>

      <!-- Payment Channel Tabs -->
      <div class="w-full flex bg-zinc-800/80 p-1 rounded-xl mb-6 border border-zinc-700/60">
        <button 
          @click="activePayTab = 'alipay'" 
          class="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
          :class="activePayTab === 'alipay' ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'"
        >
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/>
          </svg>
          <span>{{ t('paywall.tabAlipay') }}</span>
        </button>

        <button 
          @click="activePayTab = 'crypto'" 
          class="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
          :class="activePayTab === 'crypto' ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'"
        >
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <span>{{ t('paywall.tabCrypto') }}</span>
        </button>

        <button 
          @click="activePayTab = 'restore'" 
          class="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
          :class="activePayTab === 'restore' ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-black shadow-md' : 'text-zinc-400 hover:text-white'"
        >
          <span>{{ t('paywall.tabRestore') }}</span>
        </button>
      </div>

      <!-- Created Order ID Banner -->
      <div v-if="createdOrderId" class="w-full p-3.5 mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between shadow-md">
        <div class="flex flex-col gap-0.5">
          <span class="text-[10px] text-zinc-400 font-medium">{{ t('paywall.orderCreated') }}</span>
          <span class="text-xs font-mono font-black text-yellow-400 select-all tracking-wide">{{ createdOrderId }}</span>
        </div>
        <button 
          @click="copyOrderId" 
          class="px-3 py-1 bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black font-black text-xs rounded-xl transition-all shadow"
        >
          {{ copiedOrderId ? t('paywall.copiedTick') : t('paywall.copyOrderId') }}
        </button>
      </div>

      <!-- Tab 1 & Tab 2: Pricing Options (Alipay & Crypto) -->
      <template v-if="activePayTab !== 'restore'">
        <div class="w-full flex flex-col gap-3 mb-6">
          <label 
            v-for="plan in plans" 
            :key="plan.id || plan.key"
            class="w-full relative flex items-center p-4 border-2 rounded-2xl cursor-pointer transition-all bg-zinc-800/40"
            :class="selectedPlanId === plan.id || selectedPlanId === plan.key ? 'border-yellow-500 bg-yellow-500/10' : 'border-zinc-700/80 hover:border-zinc-600'"
            @click="selectedPlanId = plan.id || plan.key"
          >
            <!-- Recommended Badge -->
            <div v-if="plan.badgeText || plan.isHot" class="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-black px-2.5 py-0.5 rounded-bl-lg shadow">
              {{ plan.badgeText || t('paywall.hotDeal') }}
            </div>

            <div class="w-5 h-5 rounded-full border-2 border-zinc-500 mr-4 flex items-center justify-center" :class="{ 'border-yellow-500 bg-yellow-500': selectedPlanId === plan.id || selectedPlanId === plan.key }">
               <div class="w-2 h-2 rounded-full bg-black" v-if="selectedPlanId === plan.id || selectedPlanId === plan.key"></div>
            </div>
            <div class="flex-1">
              <div class="font-bold text-white text-sm flex items-center gap-2">
                <span>{{ plan.name }}</span>
              </div>
              <div class="text-xs text-zinc-400 mt-0.5">{{ plan.description || t('paywall.defaultPlanDesc') }}</div>
            </div>
            <div class="text-right">
              <div v-if="activePayTab === 'alipay'" class="font-bold text-yellow-500 text-lg">¥{{ plan.price }}</div>
              <div v-else class="font-bold text-emerald-400 text-lg">${{ (plan.price / 7.2).toFixed(2) }} USDT</div>
              <div class="text-xs text-zinc-500 line-through">¥{{ plan.originalPrice }}</div>
            </div>
          </label>
        </div>

        <!-- Crypto USDT Address & Live QR Code Box -->
        <div v-if="activePayTab === 'crypto'" class="w-full p-4 mb-6 rounded-2xl bg-zinc-800/90 border border-emerald-500/40 flex flex-col items-center gap-3 shadow-lg">
          <div class="w-full flex items-center justify-between">
            <span class="text-xs font-bold text-emerald-400">{{ t('paywall.cryptoAddressTitle') }}</span>
            <span v-if="cryptoOrderInfo" class="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-mono">{{ t('paywall.orderNo') }} {{ cryptoOrderInfo.orderId }}</span>
          </div>

          <!-- Live QR Code Card for TronLink / Binance / OKX / TokenPocket Wallet Scan -->
          <div v-if="cryptoOrderInfo && cryptoOrderInfo.usdtAddress" class="relative p-3 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center my-1 border border-emerald-500/30">
            <img 
              :src="`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(cryptoOrderInfo.usdtAddress)}`" 
              alt="USDT TRC20 QR Code"
              class="w-40 h-40 object-contain rounded-lg"
            />
            <span class="text-[10px] font-bold text-zinc-800 mt-1.5 flex items-center gap-1">
              <svg class="w-3.5 h-3.5 fill-emerald-600" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              {{ t('paywall.scanWithWallet') }}
            </span>
          </div>

          <div v-if="cryptoOrderInfo" class="w-full flex items-center justify-between bg-zinc-950 p-2.5 rounded-xl border border-zinc-700/60">
            <span class="text-xs font-mono text-zinc-200 select-all truncate mr-2">{{ cryptoOrderInfo.usdtAddress }}</span>
            <button @click="copyAddress" class="px-3 py-1 bg-emerald-500 text-black text-xs font-bold rounded-lg shrink-0 hover:bg-emerald-400 transition-colors">
              {{ copied ? t('paywall.copied') : t('paywall.copyAddress') }}
            </button>
          </div>

          <div v-if="cryptoOrderInfo" class="w-full flex items-center justify-between text-xs text-zinc-300">
            <span>{{ t('paywall.amountDue') }} <strong class="text-emerald-400 font-mono text-base">${{ cryptoOrderInfo.cryptoAmount }} USDT</strong></span>
            <span class="text-[11px] text-zinc-400">{{ t('paywall.autoActivateAfterTransfer') }}</span>
          </div>
        </div>

        <!-- Action Button -->
        <button 
          @click="handlePay"
          :disabled="paying"
          class="w-full py-4 font-extrabold rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
          :class="activePayTab === 'alipay' ? 'bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_30px_rgba(234,179,8,0.3)]' : 'bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600 text-black shadow-[0_0_30px_rgba(16,185,129,0.3)]'"
        >
          <span v-if="paying">{{ t('paywall.paying') }}</span>
          <span v-else-if="activePayTab === 'alipay'">{{ t('paywall.payAlipay') }}</span>
          <span v-else>{{ t('paywall.payCrypto') }}</span>
        </button>
      </template>

      <!-- Tab 3: Restore VIP via Order Number -->
      <template v-else>
        <div class="w-full flex flex-col gap-4 my-2">
          <div class="p-4 rounded-2xl bg-zinc-800/80 border border-amber-500/30 flex flex-col gap-3">
            <div class="text-sm font-bold text-amber-400 flex items-center gap-1.5">
              <span>{{ t('paywall.restoreTitle') }}</span>
            </div>
            <p class="text-xs text-zinc-300 leading-relaxed">
              {{ t('paywall.restoreDesc') }}
            </p>
            
            <div class="flex flex-col gap-2 mt-1">
              <label class="text-xs font-bold text-zinc-300">{{ t('paywall.restoreInputLabel') }}</label>
              <input 
                v-model="restoreOrderInput"
                type="text"
                :placeholder="t('paywall.restoreInputPlaceholder')"
                class="w-full px-4 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-yellow-500 transition-colors"
              />
            </div>
          </div>

          <div v-if="restoreMsg" class="p-3 rounded-xl text-xs font-bold text-center" :class="restoreSuccess ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-red-500/20 text-red-400 border border-red-500/40'">
            {{ restoreMsg }}
          </div>

          <button 
            @click="handleRestore"
            :disabled="restoring"
            class="w-full py-4 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-black font-extrabold rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
          >
            {{ restoring ? t('paywall.restoring') : t('paywall.restoreBtn') }}
          </button>
        </div>
      </template>

      <!-- Dynamic Paywall Notice & Customer Service -->
      <div class="mt-4 pt-3 border-t border-zinc-800/80 flex flex-col gap-2 text-center text-[11px] text-zinc-400">
        <p v-if="paywallNotice" class="leading-relaxed text-zinc-300">
          💡 {{ paywallNotice }}
        </p>
        <p v-if="customerServiceText" class="text-amber-400/90 font-medium">
          🎧 {{ customerServiceText }}
        </p>
        <p class="text-zinc-500">
          {{ t('paywall.agreePrefix') }}
          <button @click="showAgreementModal = true" class="text-yellow-400 underline hover:text-yellow-300">
            {{ t('paywall.agreementLink') }}
          </button>
        </p>
      </div>

      <!-- User Agreement Dynamic Modal -->
      <div 
        v-if="showAgreementModal" 
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        @click.self="showAgreementModal = false"
      >
        <div class="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto text-left shadow-2xl">
          <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h4 class="text-base font-bold text-yellow-400">{{ t('paywall.agreementTitle') }}</h4>
            <button @click="showAgreementModal = false" class="text-zinc-400 hover:text-white font-bold text-lg px-2">✕</button>
          </div>
          <div class="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {{ userAgreement }}
          </div>
          <button 
            @click="showAgreementModal = false" 
            class="w-full py-2.5 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 transition-colors mt-2"
          >
            {{ t('paywall.agreementConfirm') }}
          </button>
        </div>
      </div>

      <!-- Footer Device ID Tag -->
      <p class="text-zinc-500 text-[10px] mt-3 flex items-center gap-1 justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        {{ t('paywall.deviceIdLabel') }} <span class="font-mono text-zinc-400 select-all">{{ deviceId }}</span>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCurrentLocale, LOCALE_CHANGED_EVENT } from '../i18n'

const { t } = useI18n()

const emit = defineEmits(['close', 'vip-unlocked'])

const startY = ref(0)
const translateY = ref(0)
const isDragging = ref(false)

const activePayTab = ref('alipay')
const selectedPlanId = ref('plan-1')
const plans = ref([
  { id: 'plan-1', key: 'month', name: '包月 VIP', description: '每日高能更新，全片无限看', price: 39, originalPrice: 59 },
  { id: 'plan-2', key: 'season', name: '季卡 VIP', description: '高性价比选择，90天超长看', price: 89, originalPrice: 139, isHot: true, badgeText: '限时 6 折' },
  { id: 'plan-3', key: 'year', name: '年卡尊享 VIP', description: '全站 4K 原画库免费看', price: 169, originalPrice: 299 },
  { id: 'plan-4', key: 'lifetime', name: '永久钻石 VIP', description: '一次购买，终身永久受用', price: 299, originalPrice: 699, badgeText: '终身独家' }
])

const deviceId = ref('')
const paying = ref(false)
const cryptoOrderInfo = ref(null)
const copied = ref(false)

const createdOrderId = ref('')
const copiedOrderId = ref(false)

const copyOrderId = () => {
  if (createdOrderId.value) {
    navigator.clipboard.writeText(createdOrderId.value)
    copiedOrderId.value = true
    setTimeout(() => { copiedOrderId.value = false }, 2000)
  }
}

const restoreOrderInput = ref('')
const restoring = ref(false)
const restoreMsg = ref('')
const restoreSuccess = ref(false)

// Get or Create persistent Device Fingerprint
const getOrCreateDeviceId = () => {
  let id = localStorage.getItem('mp_device_id')
  if (!id) {
    id = 'dev-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36)
    localStorage.setItem('mp_device_id', id)
  }
  return id
}

let vipPollTimer = null

const checkVipStatus = async () => {
  if (!deviceId.value) return
  try {
    const res = await fetch(`/api/v1/paywall/vip-status?deviceId=${deviceId.value}`)
    if (res.ok) {
      const json = await res.json()
      if (json && json.data && json.data.isVip) {
        if (vipPollTimer) clearInterval(vipPollTimer)
        emit('vip-unlocked')
        emit('close')
      }
    }
  } catch (e) {
    // ignore
  }
}

const paywallNotice = ref('支付成功后系统将自动为您开通 VIP 尊享特权，支持任意设备凭订单号恢复特权。')
const userAgreement = ref('【StreamVIP 用户服务协议与隐私条款】\n\n1. 协议范围：本协议是您与 StreamVIP 平台之间关于使用本平台无删减流媒体视频服务的法律协议。\n2. 会员特权：开通 VIP 会员后，您将在订阅有效期内享有全站 4K 原画视频无限制观看与免广告特权。\n3. 退款与售后：由于数字流媒体服务的即时交付特性，虚拟数字商品一经开通生效，概不退款。如有订单异常，请提供订单号联系官方客服协助恢复。')
const customerServiceText = ref('')
const showAgreementModal = ref(false)

const loadPaywallConfig = async () => {
  try {
    const lang = getCurrentLocale()
    const res = await fetch(`/api/v1/paywall/config?lang=${lang}`)
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        if (json.data.plans) {
          plans.value = json.data.plans
          if (plans.value.length > 0) {
            selectedPlanId.value = plans.value[0].id || plans.value[0].key
          }
        }
        if (json.data.paywallNotice) paywallNotice.value = json.data.paywallNotice
        if (json.data.userAgreement) userAgreement.value = json.data.userAgreement
        if (json.data.customerServiceText) customerServiceText.value = json.data.customerServiceText
      }
    }
  } catch (e) {
    console.warn('Failed to load live paywall plans:', e)
  }
}

onMounted(async () => {
  deviceId.value = getOrCreateDeviceId()
  createdOrderId.value = localStorage.getItem('mp_latest_order_id') || ''

  // Start polling for payment completion every 3 seconds
  checkVipStatus()
  vipPollTimer = setInterval(checkVipStatus, 3000)

  await loadPaywallConfig()

  // 语言切换时刷新套餐/文案（modal 打开状态下）
  window.addEventListener(LOCALE_CHANGED_EVENT, loadPaywallConfig)
})

onUnmounted(() => {
  if (vipPollTimer) clearInterval(vipPollTimer)
  window.removeEventListener(LOCALE_CHANGED_EVENT, loadPaywallConfig)
})

const handlePay = async () => {
  paying.value = true
  try {
    if (activePayTab.value === 'alipay') {
      const res = await fetch('/api/v1/paywall/alipay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlanId.value,
          deviceId: deviceId.value
        })
      })
      const json = await res.json()
      if (json.data && json.data.orderId) {
        createdOrderId.value = json.data.orderId
        localStorage.setItem('mp_latest_order_id', json.data.orderId)
        if (json.data.payUrl) {
          window.location.href = json.data.payUrl
        }
      }
    } else if (activePayTab.value === 'crypto') {
      const res = await fetch('/api/v1/paywall/crypto/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlanId.value,
          deviceId: deviceId.value
        })
      })
      const json = await res.json()
      if (json.data) {
        cryptoOrderInfo.value = json.data
        if (json.data.orderId) {
          createdOrderId.value = json.data.orderId
          localStorage.setItem('mp_latest_order_id', json.data.orderId)
        }
      }
    }
  } catch (e) {
    alert(t('paywall.errPay'))
  } finally {
    paying.value = false
  }
}

const copyAddress = () => {
  if (cryptoOrderInfo.value && cryptoOrderInfo.value.usdtAddress) {
    navigator.clipboard.writeText(cryptoOrderInfo.value.usdtAddress)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

const handleRestore = async () => {
  if (!restoreOrderInput.value) {
    restoreMsg.value = t('paywall.errNoOrder')
    restoreSuccess.value = false
    return
  }

  restoring.value = true
  restoreMsg.value = ''
  try {
    const res = await fetch('/api/v1/paywall/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: restoreOrderInput.value.trim(),
        deviceId: deviceId.value
      })
    })
    const json = await res.json()
    if (res.ok && json.data && json.data.success) {
      restoreSuccess.value = true
      restoreMsg.value = json.message || 'VIP 权限已恢复成功！'
      setTimeout(() => {
        emit('vip-unlocked')
        emit('close')
      }, 1500)
    } else {
      restoreSuccess.value = false
      restoreMsg.value = json.message || t('paywall.errRestoreFail')
    }
  } catch (e) {
    restoreSuccess.value = false
    restoreMsg.value = t('paywall.errNetwork')
  } finally {
    restoring.value = false
  }
}

const onTouchStart = (e) => {
  startY.value = e.touches[0].clientY
  isDragging.value = true
}

const onTouchMove = (e) => {
  if (!isDragging.value) return
  const currentY = e.touches[0].clientY
  const deltaY = currentY - startY.value
  if (deltaY > 0) {
    translateY.value = deltaY
  }
}

const onTouchEnd = () => {
  if (!isDragging.value) return
  isDragging.value = false
  if (translateY.value > 50) {
    emit('close')
  } else {
    translateY.value = 0
  }
}

const onMouseDown = (e) => {
  startY.value = e.clientY
  isDragging.value = true

  const onMouseMove = (moveEvent) => {
    if (!isDragging.value) return
    const deltaY = moveEvent.clientY - startY.value
    if (deltaY > 0) {
      translateY.value = deltaY
    }
  }

  const onMouseUp = () => {
    isDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    if (translateY.value > 50) {
      emit('close')
    } else {
      translateY.value = 0
    }
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
</script>
