<template>
  <el-container class="min-h-screen bg-slate-100">
    <!-- Sidebar -->
    <el-aside width="240px" class="bg-slate-900 border-r border-slate-800 min-h-screen flex flex-col justify-between">
      <div>
        <div class="p-5 border-b border-slate-800 flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-yellow-400 to-amber-500 text-black font-black text-sm flex items-center justify-center shadow">
            ▶
          </div>
          <span class="font-bold text-white text-base">StreamVIP Admin</span>
        </div>

        <el-menu
          :default-active="activePath"
          router
          class="el-menu-vertical border-none bg-slate-900 text-slate-300"
          active-text-color="#f59e0b"
          background-color="#0f172a"
          text-color="#94a3b8"
        >
          <el-menu-item index="/dashboard">
            <el-icon><DataAnalysis /></el-icon>
            <span>控制台概览</span>
          </el-menu-item>
          <el-menu-item index="/videos">
            <el-icon><VideoCamera /></el-icon>
            <span>视频资源管理</span>
          </el-menu-item>
          <el-menu-item index="/storage-nodes">
            <el-icon><Server /></el-icon>
            <span>存储节点管理</span>
          </el-menu-item>
          <el-menu-item index="/orders">
            <el-icon><ShoppingCart /></el-icon>
            <span>营收与订单明细</span>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <span>系统设置</span>
          </el-menu-item>
        </el-menu>
      </div>

      <div class="p-4 border-t border-slate-800">
        <div class="flex items-center gap-3 px-2 py-3 rounded-xl bg-slate-800/60 mb-3">
          <el-avatar size="small" class="bg-amber-500 text-black font-bold">A</el-avatar>
          <div class="overflow-hidden">
            <div class="text-xs font-bold text-white truncate">超级管理员</div>
            <div class="text-[10px] text-slate-400">admin@streamvip.com</div>
          </div>
        </div>
        <el-button type="danger" plain class="w-full font-bold" @click="handleLogout">
          退出登录
        </el-button>
      </div>
    </el-aside>

    <!-- Main Content Area -->
    <el-container>
      <!-- Top Header -->
      <el-header height="64px" class="bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-bold text-slate-800">{{ currentTitle }}</h1>
          <el-tag type="warning" effect="dark" size="small" class="font-mono">v1.2.0 Enterprise</el-tag>
        </div>

        <div class="flex items-center gap-4">
          <div class="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-xs font-mono text-slate-600 border border-slate-200">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>当前系统时间: {{ currentTime }}</span>
          </div>

          <a href="/" target="_blank" class="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1">
            <span>预览 C 端主站</span>
            <span>↗</span>
          </a>
        </div>
      </el-header>

      <!-- Router View Container -->
      <el-main class="p-6 bg-slate-100">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()

const currentTime = ref('')
let timer = null

const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const activePath = computed(() => route.path)
const currentTitle = computed(() => route.meta?.title || '控制台')

const handleLogout = () => {
  localStorage.removeItem('isLoggedIn')
  ElMessage.success('安全退出登录')
  router.push('/login')
}
</script>
