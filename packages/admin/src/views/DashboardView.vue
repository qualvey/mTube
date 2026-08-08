<template>
  <div class="flex flex-col gap-4 sm:gap-6">
    <!-- Stat Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <el-card class="rounded-xl shadow-sm border-slate-200 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-slate-400">B 端累计已完成总营收</div>
            <div class="text-2xl font-black text-slate-800 mt-1 font-mono">
              ¥ {{ stats.totalRevenue ? stats.totalRevenue.toLocaleString() : '0.00' }}
            </div>
          </div>
          <div class="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-lg">
            ￥
          </div>
        </div>
        <div class="mt-3 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
          <span>严格过滤: 仅已完成支付 (PAID)</span>
          <span class="text-emerald-600 font-bold">100% 真实</span>
        </div>
      </el-card>

      <el-card class="rounded-xl shadow-sm border-slate-200 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-slate-400">已完成支付订单数</div>
            <div class="text-2xl font-black text-slate-800 mt-1 font-mono">
              {{ stats.paidOrderCount || 0 }} <span class="text-xs text-slate-400 font-normal">笔</span>
            </div>
          </div>
          <div class="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg">
            ✓
          </div>
        </div>
        <div class="mt-3 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
          <span>已排查过滤待支付笔数</span>
          <span class="text-slate-400">防水单</span>
        </div>
      </el-card>

      <el-card class="rounded-xl shadow-sm border-slate-200 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-slate-400">已上架视频全库总数</div>
            <div class="text-2xl font-black text-slate-800 mt-1 font-mono">
              {{ stats.totalVideos || 0 }} <span class="text-xs text-slate-400 font-normal">部</span>
            </div>
          </div>
          <div class="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
            ▶
          </div>
        </div>
        <div class="mt-3 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
          <span>云端与存储节点总存量</span>
          <router-link to="/videos" class="text-amber-600 hover:underline">去管理 →</router-link>
        </div>
      </el-card>

      <el-card class="rounded-xl shadow-sm border-slate-200 hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-slate-400">在线存储节点数</div>
            <div class="text-2xl font-black text-slate-800 mt-1 font-mono">
              {{ stats.onlineNodes || 0 }} <span class="text-xs text-slate-400 font-normal">个</span>
            </div>
          </div>
          <div class="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-lg">
            📦
          </div>
        </div>
        <div class="mt-3 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
          <span>支持多节点分布式负载</span>
          <router-link to="/storage-nodes" class="text-amber-600 hover:underline">去查看 →</router-link>
        </div>
      </el-card>
    </div>

    <!-- Cluster Nodes Probe Cards -->
    <div class="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-lg">🌐</span>
          <h2 class="text-base font-bold text-slate-800">集群存储节点心跳探针状态</h2>
          <el-tag size="small" type="success" effect="light" class="font-bold">实时探测中</el-tag>
        </div>
        <el-button size="small" type="primary" plain icon="Refresh" class="mobile-full-button" @click="fetchDashboardData">刷新心跳</el-button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="node in storageNodes"
          :key="node.id"
          class="p-4 rounded-xl border flex flex-col justify-between transition-all"
          :class="(node.status === 'HEALTHY' || node.status === 'ONLINE' || node.isOnline) ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-bold text-slate-800 text-sm">{{ node.name }}</span>
              <el-tag v-if="node.isDefault" size="small" type="warning" effect="dark">默认上传</el-tag>
            </div>
            <el-tag :type="(node.status === 'HEALTHY' || node.status === 'ONLINE' || node.isOnline) ? 'success' : 'danger'" size="small" class="font-bold">
              {{ (node.status === 'HEALTHY' || node.status === 'ONLINE' || node.isOnline) ? '🟢 连通正常' : '🔴 连通异常' }}
            </el-tag>
          </div>

          <div class="mt-3 font-mono text-xs text-slate-600 flex flex-col gap-1">
            <div>节点 ID: <span class="font-bold text-slate-800">{{ node.id }}</span></div>
            <div class="truncate">Base URL: <span class="text-amber-800">{{ node.baseUrl }}</span></div>
            <div>最后心跳: <span class="text-slate-500">{{ node.lastHeartbeat || '在线' }}</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts & Ranking Section -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Traffic PV/UV Trend Chart -->
      <el-card class="lg:col-span-2 rounded-xl shadow-sm border-slate-200">
        <template #header>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span class="font-bold text-slate-800">📊 近 7 日流量与浏览量 (PV / UV) 趋势分析</span>
            <el-tag size="small" type="info">每 10 分钟自动统计</el-tag>
          </div>
        </template>
        <div class="h-64 flex flex-col justify-end p-0 sm:p-2 gap-4 overflow-x-auto">
          <div class="min-w-[420px] flex-1 flex items-end justify-between gap-3 px-2 sm:px-4 border-b border-slate-200 pb-2">
            <div v-for="(day, i) in trafficTrend" :key="i" class="flex-1 flex flex-col items-center gap-1 group">
              <div class="w-full flex items-end justify-center gap-1.5 h-44">
                <div
                  class="w-3.5 bg-indigo-500 rounded-t transition-all group-hover:bg-indigo-600"
                  :style="{ height: day.pvHeight + '%' }"
                  :title="`PV: ${day.pv}`"
                ></div>
                <div
                  class="w-3.5 bg-emerald-500 rounded-t transition-all group-hover:bg-emerald-600"
                  :style="{ height: day.uvHeight + '%' }"
                  :title="`UV: ${day.uv}`"
                ></div>
              </div>
              <span class="text-[11px] text-slate-500 font-mono">{{ day.date }}</span>
            </div>
          </div>
          <div class="flex items-center justify-center gap-6 text-xs">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded bg-indigo-500"></span>
              <span class="text-slate-600">页面浏览量 (PV)</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded bg-emerald-500"></span>
              <span class="text-slate-600">独立访客 (UV)</span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- Top Videos Ranking Table -->
      <el-card class="rounded-xl shadow-sm border-slate-200">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-800">🔥 热门视频点击排行榜</span>
            <el-tag size="small" type="warning">Top 10</el-tag>
          </div>
        </template>
        <div class="flex flex-col gap-3">
          <div
            v-for="(v, index) in topVideos"
            :key="v.id"
            class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-none"
          >
            <div class="flex items-center gap-2.5 overflow-hidden">
              <span
                class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                :class="index === 0 ? 'bg-amber-400 text-black' : index === 1 ? 'bg-slate-300 text-slate-800' : index === 2 ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-500'"
              >
                {{ index + 1 }}
              </span>
              <img :src="v.poster || 'https://via.placeholder.com/150'" class="w-10 h-7 rounded object-cover border shrink-0" />
              <div class="truncate">
                <div class="text-xs font-bold text-slate-800 truncate">{{ v.title }}</div>
                <div class="text-[10px] text-slate-400 flex items-center gap-2">
                  <span>{{ v.author }}</span>
                  <el-tag v-if="v.isVip" size="mini" type="warning" class="px-1 py-0 h-4 text-[9px]">VIP</el-tag>
                </div>
              </div>
            </div>
            <div class="text-right shrink-0 ml-2">
              <div class="text-xs font-bold text-amber-600 font-mono">{{ v.views || 0 }} 次</div>
              <div class="text-[10px] text-slate-400">点击播放</div>
            </div>
          </div>
          <div v-if="!topVideos.length" class="text-center py-6 text-slate-400 text-xs">
            暂无视频点击数据
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiFetch } from '../utils/api.js'

const stats = ref({
  totalRevenue: 0,
  paidOrderCount: 0,
  totalVideos: 0,
  onlineNodes: 0
})

const storageNodes = ref([])
const topVideos = ref([])
const trafficTrend = ref([])

const fetchDashboardData = async () => {
  try {
    const [statsRes, nodesRes, videosRes, trendRes] = await Promise.all([
      apiFetch('/api/v1/admin/stats'),
      apiFetch('/api/v1/admin/storage-nodes'),
      apiFetch('/api/v1/admin/videos'),
      apiFetch('/api/v1/admin/analytics/trend?days=7')
    ])

    if (statsRes.ok) {
      const json = await statsRes.json()
      if (json.data) {
        stats.value.totalRevenue = json.data.totalRevenue || 0
        stats.value.paidOrderCount = json.data.paidOrderCount || 0
      }
    }

    if (nodesRes.ok) {
      const json = await nodesRes.json()
      if (json.data) {
        const list = Array.isArray(json.data) ? json.data : []
        storageNodes.value = list
        stats.value.onlineNodes = list.filter(n => n.status === 'HEALTHY' || n.status === 'ONLINE' || n.isOnline).length
      }
    }

    if (videosRes.ok) {
      const json = await videosRes.json()
      if (json.data) {
        const list = Array.isArray(json.data) ? json.data : []
        stats.value.totalVideos = list.length
        topVideos.value = [...list].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10)
      }
    }

    if (trendRes.ok) {
      const json = await trendRes.json()
      const data = json && json.data
      if (data && Array.isArray(data.dates)) {
        const pvArr = Array.isArray(data.pv) ? data.pv : []
        const uvArr = Array.isArray(data.uv) ? data.uv : []
        const max = Math.max(1, ...pvArr, ...uvArr)
        trafficTrend.value = data.dates.map((date, i) => ({
          date,
          pv: pvArr[i] || 0,
          uv: uvArr[i] || 0,
          pvHeight: Math.max(2, Math.round(((pvArr[i] || 0) / max) * 100)),
          uvHeight: Math.max(2, Math.round(((uvArr[i] || 0) / max) * 100))
        }))
      }
    }
  } catch (e) {
    console.error('Failed to fetch dashboard data:', e)
  }
}

onMounted(() => {
  fetchDashboardData()
})
</script>
