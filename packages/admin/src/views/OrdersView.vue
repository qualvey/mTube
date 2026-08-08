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
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
        <el-radio-group v-model="orderStatusFilter" size="large">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="paid">已支付</el-radio-button>
          <el-radio-button value="pending">待支付</el-radio-button>
        </el-radio-group>
      </div>

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
        <el-button size="large" type="primary" icon="Plus" class="mobile-full-button" @click="openGrantDialog('device')">
          手动开通 VIP
        </el-button>
        <el-button size="large" icon="Refresh" class="mobile-full-button" @click="fetchOrders">刷新订单表</el-button>
      </div>
    </div>

    <!-- Orders Table Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3">
          <span class="font-bold text-slate-800">📋 订单明细表 (共 {{ filteredOrders.length }} 笔)</span>
          <span class="text-xs text-slate-400">顶部统计卡始终按已支付 (PAID) 口径计算</span>
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
              :type="payChannel(row) === 'ALIPAY' ? 'primary' : 'success'"
              size="small"
              class="font-bold"
            >
              {{ payChannel(row) === 'ALIPAY' ? '🔵 支付宝' : '🟢 USDT (TRC20)' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="支付状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'PAID'" type="success" size="small" effect="dark" class="font-bold">
              ✓ 已支付
            </el-tag>
            <el-tag v-else-if="row.status === 'PENDING'" type="warning" size="small" effect="light" class="font-bold">
              ⏳ 待支付
            </el-tag>
            <el-tag v-else type="info" size="small" effect="plain" class="font-bold">
              {{ row.status || '未知' }}
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

        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <el-button
                v-if="row.status === 'PAID' || row.status === 'SUCCESS' || row.paid === true"
                type="primary"
                size="small"
                plain
                :loading="grantingOrderId === row.id"
                @click="openGrantDialog('order', row)"
              >
                补发 VIP
              </el-button>
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
              <span v-if="!row.deviceId && !(row.status === 'PAID' || row.status === 'SUCCESS' || row.paid === true)" class="text-xs text-slate-400">—</span>
            </div>
          </template>
        </el-table-column>
        </el-table>
      </div>

      <div v-if="!filteredOrders.length" class="text-center py-12 text-slate-400 text-sm">
        暂无符合条件的订单记录
      </div>
    </el-card>

    <!-- Grant / Reissue VIP Dialog -->
    <el-dialog
      :title="grantMode === 'order' ? '补发 VIP（按订单）' : '手动开通 VIP（按设备）'"
      v-model="grantDialogVisible"
      width="460px"
      :close-on-click-modal="false"
    >
      <el-form label-width="110px">
        <template v-if="grantMode === 'order'">
          <el-form-item label="订单号">
            <el-input :model-value="grantOrder?.orderNo || grantOrder?.id || ''" disabled />
          </el-form-item>
          <el-form-item label="订单设备">
            <el-input v-model="grantDeviceId" placeholder="留空则用订单绑定的设备 ID" />
            <div v-if="!grantOrder?.deviceId" class="text-xs text-amber-500 mt-1">
              该订单未绑定设备，请填写目标设备 ID
            </div>
            <div v-else class="text-xs text-slate-400 mt-1">
              当前绑定: {{ grantOrder.deviceId }}（套餐时长取自订单 planId）
            </div>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="设备 ID" required>
            <el-input v-model="grantDeviceId" placeholder="输入设备指纹 ID" />
          </el-form-item>
          <el-form-item label="VIP 套餐" required>
            <el-select v-model="grantPlanId" style="width: 100%">
              <el-option label="月卡 (30 天)" value="month" />
              <el-option label="季卡 (90 天)" value="season" />
              <el-option label="年卡 (365 天)" value="year" />
              <el-option label="永久 (36500 天)" value="lifetime" />
            </el-select>
          </el-form-item>
        </template>
        <div class="text-xs text-slate-400">
          已有未过期 VIP 时，时长将在原到期时间上顺延叠加。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="grantDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="grantSubmitting" @click="handleGrantVip">确认开通</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiFetch } from '../utils/api.js'

const allOrders = ref([])
const searchOrderKeyword = ref('')
const orderStatusFilter = ref('all')

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
const grantingOrderId = ref('')

const grantDialogVisible = ref(false)
const grantMode = ref('device') // 'device' | 'order'
const grantOrder = ref(null)
const grantDeviceId = ref('')
const grantPlanId = ref('month')
const grantSubmitting = ref(false)

const openGrantDialog = (mode, row = null) => {
  grantMode.value = mode
  grantOrder.value = row
  grantDeviceId.value = row?.deviceId || ''
  grantPlanId.value = 'month'
  grantDialogVisible.value = true
}

const handleGrantVip = async () => {
  const deviceId = (grantDeviceId.value || '').trim()
  if (grantMode.value === 'order') {
    const order = grantOrder.value
    if (!order) return
    // 订单无绑定设备时必须显式填写目标设备
    if (!order.deviceId && !deviceId) {
      ElMessage.warning('该订单未绑定设备，请填写目标设备 ID')
      return
    }
    grantingOrderId.value = order.id
  } else {
    if (!deviceId) {
      ElMessage.warning('请输入设备 ID')
      return
    }
  }

  grantSubmitting.value = true
  try {
    let res
    if (grantMode.value === 'order') {
      res = await apiFetch(`/api/v1/admin/orders/${encodeURIComponent(grantOrder.value.id)}/grant-vip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId || undefined })
      })
    } else {
      res = await apiFetch(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/grant-vip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: grantPlanId.value })
      })
    }
    const json = await res.json()
    if (res.ok && json.code === 200) {
      ElMessage.success(
        grantMode.value === 'order' ? '订单 VIP 补发成功' : '设备 VIP 开通成功'
      )
      grantDialogVisible.value = false
      await fetchOrders()
    } else {
      ElMessage.error(json.message || '操作失败')
    }
  } catch (e) {
    ElMessage.error(grantMode.value === 'order' ? '补发失败，请重试' : '开通失败，请重试')
  } finally {
    grantSubmitting.value = false
    grantingOrderId.value = ''
  }
}

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
  let rows = allOrders.value
  if (orderStatusFilter.value === 'paid') {
    rows = rows.filter(o => o.status === 'PAID' || o.status === 'SUCCESS' || o.paid === true)
  } else if (orderStatusFilter.value === 'pending') {
    rows = rows.filter(o => o.status === 'PENDING')
  }
  if (!searchOrderKeyword.value) return rows
  const kw = searchOrderKeyword.value.toLowerCase()
  return rows.filter(o => {
    return (o.orderNo && o.orderNo.toLowerCase().includes(kw)) ||
      (o.id && String(o.id).includes(kw)) ||
      (o.deviceId && o.deviceId.toLowerCase().includes(kw))
  })
})

const totalPaidAmount = computed(() => {
  return paidOrders.value.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
})

const payChannel = (o) => {
  // 后端字段为 payType: 'alipay' | 'ruyizf' | 'crypto_usdt'（小写）
  // 兼容历史数据：有 cryptoAmount 视为 USDT；其余（含空值/ruyizf/旧 alipay）归为支付宝
  if (o.payType === 'crypto_usdt') return 'USDT'
  if (o.cryptoAmount && Number(o.cryptoAmount) > 0) return 'USDT'
  return 'ALIPAY'
}

const alipayPaidCount = computed(() => {
  return paidOrders.value.filter(o => payChannel(o) === 'ALIPAY').length
})

const usdtPaidCount = computed(() => {
  return paidOrders.value.filter(o => payChannel(o) === 'USDT').length
})
</script>
