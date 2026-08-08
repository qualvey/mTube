<template>
  <div class="flex flex-col gap-4 sm:gap-6">
    <!-- Stat Summary Header Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <el-card class="rounded-xl shadow-sm border-slate-200">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-slate-400">已完成支付累计流水 (PAID)</div>
            <div class="text-2xl font-black text-slate-800 mt-1 font-mono">
              ¥ {{ totalPaidAmount.toLocaleString() }}
            </div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
            ￥
          </div>
        </div>
      </el-card>

      <el-card class="rounded-xl shadow-sm border-slate-200">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-slate-400">真实已支付订单笔数</div>
            <div class="text-2xl font-black text-slate-800 mt-1 font-mono">
              {{ paidOrders.length }} <span class="text-xs text-slate-400 font-normal">笔</span>
            </div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
            ✓
          </div>
        </div>
      </el-card>

      <el-card class="rounded-xl shadow-sm border-slate-200">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-slate-400">支付渠道构成</div>
            <div class="text-xs font-bold text-slate-700 mt-2 flex items-center gap-3 font-mono">
              <span class="text-blue-600">支付宝: {{ alipayPaidCount }} 笔</span>
              <span class="text-emerald-600">USDT: {{ usdtPaidCount }} 笔</span>
            </div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
            💳
          </div>
        </div>
      </el-card>
    </div>

    <!-- Orders Filter & Search Bar -->
    <div class="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex items-center gap-3 flex-1 w-full md:max-w-lg">
        <el-input
          v-model="searchOrderKeyword"
          placeholder="搜索订单号、指纹 ID 或关联设备号..."
          clearable
          prefix-icon="Search"
        />
      </div>

      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
        <el-tag type="success" size="large" effect="dark" class="font-bold justify-center whitespace-normal h-auto py-2 text-center">
          严格模式: 仅统计已完成支付 (PAID) 订单
        </el-tag>
        <el-button size="large" icon="Refresh" class="mobile-full-button" @click="fetchOrders">刷新订单表</el-button>
      </div>
    </div>

    <!-- Orders Table Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3">
          <span class="font-bold text-slate-800">📋 已支付订单明细表 (共 {{ filteredOrders.length }} 笔)</span>
          <span class="text-xs text-slate-400">已排查过滤未支付水单</span>
        </div>
      </template>

      <div class="admin-table-scroll">
        <el-table :data="filteredOrders" style="width: 100%" stripe>
        <el-table-column label="订单号 / 时间" min-width="200">
          <template #default="{ row }">
            <div class="font-mono font-bold text-slate-800 text-xs">{{ row.orderNo || row.id }}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">{{ row.createdAt || '最新' }}</div>
          </template>
        </el-table-column>

        <el-table-column label="VIP 套餐" width="140">
          <template #default="{ row }">
            <el-tag type="warning" size="small" effect="light" class="font-bold">
              👑 {{ row.planName || row.plan || 'VIP 月卡' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="支付金额" width="130">
          <template #default="{ row }">
            <div class="font-mono font-bold text-emerald-600 text-sm">
              ¥ {{ Number(row.amount || 0).toFixed(2) }}
            </div>
            <div v-if="row.cryptoAmount" class="text-[10px] text-slate-400 font-mono">
              ({{ row.cryptoAmount }} USDT)
            </div>
          </template>
        </el-table-column>

        <el-table-column label="支付渠道" width="120">
          <template #default="{ row }">
            <el-tag
              :type="row.paymentMethod === 'ALIPAY' ? 'primary' : 'success'"
              size="small"
              class="font-bold"
            >
              {{ row.paymentMethod === 'ALIPAY' ? '🔵 支付宝' : '🟢 USDT (TRC20)' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="支付状态" width="120">
          <template #default>
            <el-tag type="success" size="small" effect="dark" class="font-bold">
              ✓ 已完成支付
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="设备指纹 (DeviceId)" min-width="200">
          <template #default="{ row }">
            <div class="font-mono text-xs text-slate-600 truncate max-w-xs" :title="row.deviceId">
              {{ row.deviceId || '匿名设备' }}
            </div>
            <el-tag v-if="row.deviceId && row.isVip" type="success" size="small" class="mt-1">👑 VIP 生效中</el-tag>
            <el-tag v-else-if="row.deviceId" type="info" size="small" class="mt-1">无 VIP</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.deviceId"
              type="danger"
              size="small"
              plain
              :disabled="!row.isVip"
              :loading="revokingDeviceId === row.deviceId"
              @click="handleRevokeVip(row)"
            >
              撤销 VIP
            </el-button>
            <span v-else class="text-xs text-slate-400">—</span>
          </template>
        </el-table-column>
        </el-table>
      </div>

      <div v-if="!filteredOrders.length" class="text-center py-12 text-slate-400 text-sm">
        暂无已完成支付的订单记录
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiFetch } from '../utils/api.js'

const allOrders = ref([])
const searchOrderKeyword = ref('')

const fetchOrders = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/orders')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        allOrders.value = json.data
      }
    }
  } catch (e) {
    ElMessage.error('获取订单列表失败')
  }
}

const revokingDeviceId = ref('')

const handleRevokeVip = async (row) => {
  if (!row.deviceId) return
  try {
    await ElMessageBox.confirm(
      `确定撤销设备「${row.deviceId}」的 VIP 权限吗？\n撤销后该设备立即失去 VIP 访问能力，不可自动恢复。`,
      '撤销 VIP 确认',
      { type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户取消
  }

  revokingDeviceId.value = row.deviceId
  try {
    const res = await apiFetch(
      `/api/v1/admin/devices/${encodeURIComponent(row.deviceId)}/revoke-vip`,
      { method: 'POST' }
    )
    const json = await res.json()
    if (res.ok && json.code === 200) {
      ElMessage.success('已撤销该设备 VIP')
      await fetchOrders()
    } else {
      ElMessage.error(json.message || '撤销失败')
    }
  } catch (e) {
    ElMessage.error('撤销失败，请重试')
  } finally {
    revokingDeviceId.value = ''
  }
}

onMounted(() => {
  fetchOrders()
})

const paidOrders = computed(() => {
  return allOrders.value.filter(o => o.status === 'PAID' || o.status === 'SUCCESS' || o.paid === true)
})

const filteredOrders = computed(() => {
  return paidOrders.value.filter(o => {
    if (!searchOrderKeyword.value) return true
    const kw = searchOrderKeyword.value.toLowerCase()
    return (o.orderNo && o.orderNo.toLowerCase().includes(kw)) ||
      (o.id && String(o.id).includes(kw)) ||
      (o.deviceId && o.deviceId.toLowerCase().includes(kw))
  })
})

const totalPaidAmount = computed(() => {
  return paidOrders.value.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
})

const alipayPaidCount = computed(() => {
  return paidOrders.value.filter(o => o.paymentMethod === 'ALIPAY' || !o.paymentMethod).length
})

const usdtPaidCount = computed(() => {
  return paidOrders.value.filter(o => o.paymentMethod === 'USDT' || o.cryptoAmount).length
})
</script>
