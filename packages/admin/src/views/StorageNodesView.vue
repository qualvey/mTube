<template>
  <div class="flex flex-col gap-6">
    <!-- Action Header Bar -->
    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
      <div>
        <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
          <span>📦 存储节点集群管理</span>
          <el-tag size="small" type="success" effect="light" class="font-bold">已挂载 {{ storageNodes.length }} 节点</el-tag>
        </h2>
        <p class="text-xs text-slate-400 mt-1">支持多节点自动心跳鉴权注册，分布式下发直传凭证与智能打卡</p>
      </div>

      <div class="flex items-center gap-3">
        <el-button size="large" icon="Refresh" @click="fetchStorageNodes">刷新节点探针</el-button>
        <el-button type="warning" size="large" icon="Plus" class="font-bold" @click="openAddNodeModal">
          注册新存储节点
        </el-button>
      </div>
    </div>

    <!-- Storage Nodes List Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="node in storageNodes"
        :key="node.id"
        class="bg-white rounded-2xl border p-5 shadow-sm flex flex-col justify-between transition-all hover:shadow-md"
        :class="node.isDefault ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-slate-200'"
      >
        <div>
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-800 text-base">{{ node.name }}</span>
              <el-tag v-if="node.isDefault" size="small" type="warning" effect="dark" class="font-bold">⭐ 默认节点</el-tag>
            </div>
            <el-tag :type="(node.status === 'HEALTHY' || node.status === 'ONLINE' || node.isOnline) ? 'success' : 'danger'" size="small" class="font-bold">
              {{ (node.status === 'HEALTHY' || node.status === 'ONLINE' || node.isOnline) ? '🟢 连通正常' : '🔴 连通异常' }}
            </el-tag>
          </div>

          <div class="mt-4 flex flex-col gap-2 font-mono text-xs text-slate-600">
            <div class="flex justify-between py-1 border-b border-slate-50">
              <span class="text-slate-400 font-sans">节点 ID:</span>
              <span class="font-bold text-slate-800">{{ node.id }}</span>
            </div>

            <div class="flex justify-between py-1 border-b border-slate-50">
              <span class="text-slate-400 font-sans">Base URL:</span>
              <span class="text-amber-800 truncate max-w-[200px]" :title="node.baseUrl">{{ node.baseUrl }}</span>
            </div>

            <div class="flex justify-between py-1 border-b border-slate-50">
              <span class="text-slate-400 font-sans">注册 IP 地址:</span>
              <span class="text-slate-700">{{ node.registeredIp || '自动捕获' }}</span>
            </div>

            <div class="flex justify-between py-1">
              <span class="text-slate-400 font-sans">最后心跳时间:</span>
              <span class="text-slate-500">{{ node.lastHeartbeat || '刚刚' }}</span>
            </div>
          </div>
        </div>

        <div class="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <el-button
            v-if="!node.isDefault"
            size="small"
            type="warning"
            plain
            class="font-bold"
            @click="setDefaultNode(node.id)"
          >
            设为默认上传节点
          </el-button>
          <span v-else class="text-xs text-amber-600 font-bold">默认直传节点</span>

          <el-button
            size="small"
            type="danger"
            plain
            icon="Delete"
            @click="handleDeleteNode(node.id)"
          >
            注销
          </el-button>
        </div>
      </div>
    </div>

    <!-- Storage Node Modal Component -->
    <StorageNodeModal
      v-model:visible="nodeModalVisible"
      :form="nodeForm"
      @submit="handleModalSubmit"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StorageNodeModal from '../components/StorageNodeModal.vue'

const storageNodes = ref([])
const nodeModalVisible = ref(false)
const nodeForm = ref({
  id: '',
  name: '',
  baseUrl: '',
  isDefault: false
})

const fetchStorageNodes = async () => {
  try {
    const res = await fetch('/api/v1/admin/storage-nodes')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        storageNodes.value = json.data
      }
    }
  } catch (e) {
    ElMessage.error('获取存储节点列表失败')
  }
}

onMounted(() => {
  fetchStorageNodes()
})

const openAddNodeModal = () => {
  nodeForm.value = {
    id: `node-0${storageNodes.value.length + 1}`,
    name: `存储节点 0${storageNodes.value.length + 1}`,
    baseUrl: 'https://storage02.91cso.com',
    isDefault: false
  }
  nodeModalVisible.value = true
}

const handleModalSubmit = async () => {
  try {
    const res = await fetch('/api/v1/admin/storage-nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nodeForm.value)
    })
    const json = await res.json()
    if (json.code === 200) {
      ElMessage.success(`存储节点 [${nodeForm.value.name}] 注册成功！`)
      nodeModalVisible.value = false
      fetchStorageNodes()
    } else {
      ElMessage.error(json.message || '节点注册失败')
    }
  } catch (e) {
    ElMessage.error('网络请求失败')
  }
}

const setDefaultNode = async (nodeId) => {
  try {
    const res = await fetch(`/api/v1/admin/storage-nodes/${nodeId}/set-default`, {
      method: 'POST'
    })
    const json = await res.json()
    if (json.code === 200) {
      ElMessage.success('存储节点已成功设为默认上传节点！')
      fetchStorageNodes()
    }
  } catch (e) {
    ElMessage.error('设置失败')
  }
}

const handleDeleteNode = (nodeId) => {
  ElMessageBox.confirm(`确定要注销存储节点 ${nodeId} 吗？`, '警告', {
    confirmButtonText: '确定注销',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      const res = await fetch(`/api/v1/admin/storage-nodes/${nodeId}`, { method: 'DELETE' })
      if (res.ok) {
        ElMessage.success('存储节点已注销')
        fetchStorageNodes()
      }
    } catch (e) {
      ElMessage.error('注销失败')
    }
  })
}
</script>
