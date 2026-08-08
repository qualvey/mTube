<template>
  <el-container class="min-h-screen min-w-0 bg-slate-100">
    <el-aside width="240px" class="hidden lg:flex bg-slate-900 border-r border-slate-800 min-h-screen flex-col justify-between">
      <div>
        <div class="p-5 border-b border-slate-800 flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-amber-400 text-black font-black text-sm flex items-center justify-center shadow">▶</div>
          <span class="font-bold text-white text-base">StreamVIP Admin</span>
        </div>

        <el-menu
          :default-active="activePath"
          router
          class="border-none"
          active-text-color="#f59e0b"
          background-color="#0f172a"
          text-color="#94a3b8"
        >
          <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>
      </div>

      <div class="p-4 border-t border-slate-800">
        <AdminProfile />
        <el-button type="danger" plain class="w-full font-bold" @click="handleLogout">退出登录</el-button>
      </div>
    </el-aside>

    <el-drawer
      v-model="mobileNavOpen"
      direction="ltr"
      size="280px"
      :with-header="false"
      class="admin-mobile-drawer"
    >
      <div class="min-h-full bg-slate-900 flex flex-col justify-between">
        <div>
          <div class="p-5 border-b border-slate-800 flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl bg-amber-400 text-black font-black text-sm flex items-center justify-center">▶</div>
            <span class="font-bold text-white text-base">StreamVIP Admin</span>
          </div>
          <el-menu
            :default-active="activePath"
            router
            class="border-none"
            active-text-color="#f59e0b"
            background-color="#0f172a"
            text-color="#94a3b8"
          >
            <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </el-menu-item>
          </el-menu>
        </div>

        <div class="p-4 border-t border-slate-800">
          <AdminProfile />
          <el-button type="danger" plain class="w-full font-bold" @click="handleLogout">退出登录</el-button>
        </div>
      </div>
    </el-drawer>

    <el-container class="min-w-0">
      <el-header height="64px" class="bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 shadow-sm gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <el-button circle class="lg:hidden shrink-0" aria-label="打开导航菜单" @click="mobileNavOpen = true">
            <el-icon><Menu /></el-icon>
          </el-button>
          <h1 class="text-base sm:text-lg font-bold text-slate-800 truncate">{{ currentTitle }}</h1>
          <el-tag type="warning" effect="dark" size="small" class="hidden sm:inline-flex font-mono shrink-0">v1.2.0 Enterprise</el-tag>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <div class="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-xs font-mono text-slate-600 border border-slate-200">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>当前系统时间: {{ currentTime }}</span>
          </div>
          <a href="/" target="_blank" class="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1" aria-label="预览 C 端主站">
            <span class="hidden sm:inline">预览 C 端主站</span>
            <span>↗</span>
          </a>
        </div>
      </el-header>

      <el-main class="p-3 sm:p-6 bg-slate-100 min-w-0">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, defineComponent, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const AdminProfile = defineComponent({
  setup() {
    return () => h('div', { class: 'flex items-center gap-3 px-2 py-3 rounded-xl bg-slate-800/60 mb-3' }, [
      h('div', { class: 'w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-bold flex items-center justify-center shrink-0' }, 'A'),
      h('div', { class: 'min-w-0' }, [
        h('div', { class: 'text-xs font-bold text-white truncate' }, '超级管理员'),
        h('div', { class: 'text-[10px] text-slate-400 truncate' }, 'admin@streamvip.com')
      ])
    ])
  }
})

const route = useRoute()
const router = useRouter()
const currentTime = ref('')
const mobileNavOpen = ref(false)
let timer = null

const menuItems = [
  { path: '/dashboard', label: '控制台概览', icon: 'DataAnalysis' },
  { path: '/analytics', label: '数据分析', icon: 'TrendCharts' },
  { path: '/videos', label: '视频资源管理', icon: 'VideoCamera' },
  { path: '/storage-nodes', label: '存储节点管理', icon: 'Server' },
  { path: '/orders', label: '营收与订单明细', icon: 'ShoppingCart' },
  { path: '/settings', label: '系统设置', icon: 'Setting' }
]

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

watch(() => route.path, () => {
  mobileNavOpen.value = false
})

const handleLogout = () => {
  localStorage.removeItem('isLoggedIn')
  ElMessage.success('安全退出登录')
  router.push('/login')
}
</script>
