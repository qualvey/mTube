<template>
  <div class="flex flex-col gap-6 max-w-4xl">
    <!-- Payment & Currency Configuration Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-slate-800">
            <span>💳 支付接口与汇率换算配置 (Alipay & USDT)</span>
          </div>
          <el-tag type="warning" size="small">实时生效</el-tag>
        </div>
      </template>

      <el-form :model="settings" label-position="top">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <el-form-item label="支付宝 AppID">
            <el-input v-model="settings.alipayAppId" placeholder="例如：2021000000000000" />
          </el-form-item>

          <el-form-item label="支付宝异步通知 Callback URL">
            <el-input v-model="settings.alipayNotifyUrl" placeholder="https://api.91cso.com/api/v1/paywall/alipay/notify" />
          </el-form-item>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <el-form-item label="支付宝应用私钥 (App Private Key)">
            <el-input v-model="settings.alipayPrivateKey" type="textarea" :rows="2" placeholder="MIIEowIBAAKCAQEA..." />
          </el-form-item>

          <el-form-item label="支付宝公钥 (Alipay Public Key)">
            <el-input v-model="settings.alipayPublicKey" type="textarea" :rows="2" placeholder="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..." />
          </el-form-item>
        </div>

        <div class="border-t border-slate-100 my-3 pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <el-form-item label="USDT (TRC-20) 官方收款地址">
            <el-input v-model="settings.cryptoUsdtAddress" placeholder="TY7x9N2m8Qk4Pz1v6W3s5R7u9Y2X4B6C8V" />
          </el-form-item>

          <el-form-item label="USDT ➔ CNY 汇率换算 (1 USDT = ? CNY)">
            <el-input v-model="settings.cryptoExchangeRate" placeholder="例如：7.2" />
          </el-form-item>
        </div>
      </el-form>
    </el-card>

    <!-- Notice Banner & Hero Banner Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <span class="font-bold text-slate-800">📢 C 端公告横幅与 Hero 封面设置</span>
      </template>

      <el-form :model="settings" label-position="top">
        <el-form-item label="开启 C 端全局顶部公告栏">
          <el-switch v-model="settings.enableNotice" active-text="显示公告" inactive-text="隐藏公告" />
        </el-form-item>

        <div v-if="settings.enableNotice" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <el-form-item label="公告标题">
            <el-input v-model="settings.noticeTitle" placeholder="📢 官方重要公告" />
          </el-form-item>

          <el-form-item label="公告详细文字">
            <el-input v-model="settings.noticeContent" type="textarea" :rows="2" placeholder="公告内容..." />
          </el-form-item>
        </div>

        <div class="border-t border-slate-100 my-3 pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <el-form-item label="Hero 封面图片 URL">
            <el-input v-model="settings.heroImageUrl" placeholder="https://images.unsplash.com/..." />
          </el-form-item>

          <el-form-item label="Hero 大标题">
            <el-input v-model="settings.heroTitle" placeholder="极致诱惑" />
          </el-form-item>
        </div>

        <el-form-item label="Hero 副标题">
          <el-input v-model="settings.heroSubtitle" placeholder="滑动探索更多独家无删减内容" />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Player & Performance Configuration Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <span class="font-bold text-slate-800">⚙️ 播放器试看与传输参数配置</span>
      </template>

      <el-form :model="settings" label-position="top">
        <el-form-item label="启用拖拽进度条实时截图预览 (Seek Preview)">
          <el-switch v-model="settings.enableSeekPreview" active-text="开启悬浮缩略图" inactive-text="关闭缩略图" />
        </el-form-item>

        <el-form-item label="默认全局备用存储节点地址">
          <el-input v-model="settings.activeStorageNodeUrl" placeholder="https://storage02.91cso.com" />
        </el-form-item>

        <el-form-item label="直传切片 TCP 并发连接数 (Concurrency Limit)">
          <el-input-number v-model="settings.uploadChunkConcurrency" :min="2" :max="8" :step="1" />
          <span class="text-xs text-slate-500 ml-2">
            (默认 4 通道并行，在劣质跨国网络下推荐开至 4-6 通道突破单 TCP 拥塞瓶颈)
          </span>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Submit Save Button -->
    <div class="flex justify-end">
      <el-button
        type="warning"
        size="large"
        class="font-bold px-8 py-3 rounded-xl shadow-md"
        :loading="saveLoading"
        @click="saveSettings"
      >
        保存全部系统设置
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const saveLoading = ref(false)
const settings = ref({
  alipayAppId: '',
  alipayPrivateKey: '',
  alipayPublicKey: '',
  alipayNotifyUrl: 'http://localhost:3000/api/v1/paywall/alipay/notify',
  cryptoUsdtAddress: 'TY7x9N2m8Qk4Pz1v6W3s5R7u9Y2X4B6C8V',
  cryptoExchangeRate: '7.2',
  enableNotice: true,
  noticeTitle: '📢 官方重要公告',
  noticeContent: '欢迎来到 StreamVIP 独家流媒体平台！升级尊享 VIP 会员可无限制观看全站无删减 4K 超清原画库！客服在线时间：10:00 - 24:00。',
  heroImageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop',
  heroTitle: '极致诱惑',
  heroSubtitle: '滑动探索更多独家无删减内容',
  enableSeekPreview: true,
  uploadChunkConcurrency: 4,
  activeStorageNodeUrl: 'https://storage02.91cso.com'
})

const fetchSettings = async () => {
  try {
    const res = await fetch('/api/v1/admin/settings')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        settings.value = { ...settings.value, ...json.data }
      }
    }
  } catch (e) {}
}

onMounted(() => {
  fetchSettings()
})

const saveSettings = async () => {
  saveLoading.value = true
  try {
    const res = await fetch('/api/v1/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings.value)
    })
    const json = await res.json()
    if (res.ok && json.code === 200) {
      ElMessage.success('系统参数配置已保存成功！')
    } else {
      ElMessage.error(json.message || '保存设置失败')
    }
  } catch (e) {
    ElMessage.error('网络请求失败')
  } finally {
    saveLoading.value = false
  }
}
</script>
