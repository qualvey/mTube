<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/70 backdrop-blur-md" @click="$emit('close')"></div>

    <!-- Modal -->
    <div class="relative w-full max-w-sm bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-lg font-black text-white">
          {{ headerTitle }}
        </h2>
        <button
          @click="$emit('close')"
          class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all"
          :aria-label="t('auth.close')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 验证码确认模式 -->
      <form v-if="mode === 'verify'" class="flex flex-col gap-3.5" @submit.prevent="onVerify">
        <p class="text-xs text-zinc-400 leading-relaxed">
          {{ t('auth.verifyHint') }}
          <span class="text-zinc-200 font-bold">{{ verifyEmail }}</span>
        </p>

        <div>
          <label class="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{{ t('auth.code') }}</label>
          <input
            v-model.trim="form.code"
            type="text"
            inputmode="numeric"
            maxlength="6"
            required
            :placeholder="t('auth.codePlaceholder')"
            class="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 tracking-[0.3em] text-center font-mono focus:outline-none focus:border-yellow-500/60 focus:ring-1 focus:ring-yellow-500/30 transition-all"
          />
        </div>

        <!-- 开发模式提示（未配置 RESEND_API_KEY 时后端返回 devCode） -->
        <p v-if="devCode" class="text-[11px] text-yellow-400/90 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
          {{ t('auth.devCodeHint') }} <span class="font-mono font-black tracking-widest">{{ devCode }}</span>
        </p>

        <p v-if="error" class="text-xs text-red-400 font-medium">{{ error }}</p>

        <button
          type="submit"
          :disabled="submitting"
          class="mt-1 w-full py-3 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 disabled:opacity-60 text-black font-black text-sm rounded-xl shadow-lg transition-all active:scale-95"
        >
          {{ submitting ? t('auth.submitting') : t('auth.confirmCode') }}
        </button>

        <button
          type="button"
          @click="resendCode"
          :disabled="resending"
          class="text-xs text-zinc-400 hover:text-yellow-400 transition-colors"
        >
          {{ resending ? t('auth.submitting') : t('auth.resendCode') }}
        </button>
      </form>

      <!-- 登录 / 注册表单 -->
      <form v-else class="flex flex-col gap-3.5" @submit.prevent="onSubmit">
        <div v-if="mode === 'register'">
          <label class="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{{ t('auth.nickname') }}</label>
          <input
            v-model.trim="form.nickname"
            type="text"
            maxlength="24"
            :placeholder="t('auth.nicknamePlaceholder')"
            class="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-500/60 focus:ring-1 focus:ring-yellow-500/30 transition-all"
          />
        </div>

        <div>
          <label class="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{{ t('auth.email') }}</label>
          <input
            v-model.trim="form.email"
            type="email"
            required
            autocomplete="email"
            :placeholder="t('auth.emailPlaceholder')"
            class="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-500/60 focus:ring-1 focus:ring-yellow-500/30 transition-all"
          />
        </div>

        <div>
          <label class="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{{ t('auth.password') }}</label>
          <input
            v-model="form.password"
            type="password"
            required
            autocomplete="current-password"
            :placeholder="t('auth.passwordPlaceholder')"
            class="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-500/60 focus:ring-1 focus:ring-yellow-500/30 transition-all"
          />
        </div>

        <p v-if="error" class="text-xs text-red-400 font-medium">{{ error }}</p>

        <button
          type="submit"
          :disabled="submitting"
          class="mt-1 w-full py-3 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 disabled:opacity-60 text-black font-black text-sm rounded-xl shadow-lg transition-all active:scale-95"
        >
          {{ submitting ? t('auth.submitting') : (mode === 'login' ? t('auth.login') : t('auth.register')) }}
        </button>
      </form>

      <button
        v-if="mode !== 'verify'"
        @click="switchMode"
        class="mt-4 text-xs text-zinc-400 hover:text-yellow-400 transition-colors"
      >
        {{ mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { authService } from '../services/authService'

const { t } = useI18n()
const emit = defineEmits(['close', 'success'])

const mode = ref('login') // login | register | verify
const form = ref({ email: '', password: '', nickname: '', code: '' })
const verifyEmail = ref('')
const devCode = ref('')
const error = ref('')
const submitting = ref(false)
const resending = ref(false)

const headerTitle = computed(() => {
  if (mode.value === 'verify') return t('auth.verifyTitle')
  return mode.value === 'login' ? t('auth.login') : t('auth.register')
})

const switchMode = () => {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = ''
}

const onSubmit = async () => {
  error.value = ''
  submitting.value = true
  try {
    const r = mode.value === 'login'
      ? await authService.login({ email: form.value.email, password: form.value.password })
      : await authService.register(form.value)
    if (!r.ok) {
      error.value = r.message
      return
    }
    if (r.requiresVerification) {
      // 进入验证码确认步骤（保留表单数据，后续可重发）
      verifyEmail.value = form.value.email
      devCode.value = r.devCode || ''
      form.value.code = ''
      mode.value = 'verify'
      return
    }
    emit('success', r.user)
    emit('close')
  } finally {
    submitting.value = false
  }
}

const onVerify = async () => {
  error.value = ''
  submitting.value = true
  try {
    const r = await authService.verify({ email: verifyEmail.value, code: form.value.code })
    if (!r.ok) {
      error.value = r.message
      return
    }
    emit('success', r.user)
    emit('close')
  } finally {
    submitting.value = false
  }
}

const resendCode = async () => {
  error.value = ''
  resending.value = true
  try {
    const r = await authService.register({ email: verifyEmail.value, password: form.value.password, nickname: form.value.nickname })
    if (!r.ok) {
      error.value = r.message
      return
    }
    if (r.devCode) devCode.value = r.devCode
    form.value.code = ''
  } finally {
    resending.value = false
  }
}
</script>
