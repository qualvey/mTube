<template>
  <div class="min-h-screen bg-slate-900 flex items-center justify-center p-4">
    <el-card class="w-full max-w-md shadow-2xl border-slate-800 rounded-2xl p-6 bg-slate-800/90 text-white">
      <template #header>
        <div class="text-center py-2">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-yellow-500 to-amber-600 text-black font-black text-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            ▶
          </div>
          <h2 class="text-2xl font-bold text-white">StreamVIP 管理控制台</h2>
          <p class="text-xs text-slate-400 mt-1">请输入管理员账号登录系统</p>
        </div>
      </template>

      <el-form :model="loginForm" label-position="top" @keyup.enter="handleLogin">
        <el-form-item label="管理员账号">
          <el-input v-model="loginForm.username" placeholder="请输入管理员账号" prefix-icon="User" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" placeholder="请输入密码" show-password prefix-icon="Lock" />
        </el-form-item>
        <el-button
          type="warning"
          class="w-full mt-4 font-bold text-base py-3 rounded-xl shadow-lg"
          :loading="loginLoading"
          @click="handleLogin"
        >
          安全登录
        </el-button>
      </el-form>

      <div class="text-center mt-4 text-xs text-slate-500">
        默认凭证: admin / admin123 (可在环境变量配置)
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { setAdminToken } from '../utils/api.js'

const router = useRouter()
const loginForm = ref({ username: 'admin', password: '' })
const loginLoading = ref(false)

const handleLogin = async () => {
  if (!loginForm.value.username || !loginForm.value.password) {
    ElMessage.warning('请输入管理员账号和密码')
    return
  }

  loginLoading.value = true
  try {
    const res = await fetch('/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm.value)
    })
    const json = await res.json()
    if (res.ok && json.code === 200) {
      setAdminToken(json.data?.token)
      localStorage.setItem('isLoggedIn', 'true')
      ElMessage.success('登录成功！欢迎回来，管理员')
      router.push('/dashboard')
    } else {
      ElMessage.error(json.message || '账号或密码错误')
    }
  } catch (e) {
    ElMessage.error('连接服务器失败')
  } finally {
    loginLoading.value = false
  }
}
</script>
