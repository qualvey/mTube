<template>
  <div class="flex flex-col gap-4 sm:gap-6 max-w-4xl">
    <!-- 收费模式全局开关 Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2 font-bold text-slate-800">
            <span>💰 收费模式（全局开关）</span>
          </div>
          <el-tag :type="settings.paywallEnabled ? 'success' : 'info'" size="small">
            {{ settings.paywallEnabled ? '已开启' : '已关闭' }}
          </el-tag>
        </div>
      </template>

      <el-form :model="settings" label-position="top">
        <el-form-item label="启用收费模式（付费墙 / VIP / 试看）">
          <el-switch v-model="settings.paywallEnabled" active-text="开启收费" inactive-text="全站免费" />
        </el-form-item>
        <div v-if="!settings.paywallEnabled" class="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 leading-relaxed">
          ⚠️ 当前为<b>全站免费模式</b>：C 端不显示 VIP 徽标/锁/试看倒计时，付费墙与弹窗全部停用，
          videos 表的 VIP 标记被忽略；支付接口返回停用（支付宝回调除外）。下方支付配置不会生效，可随时重新开启。
        </div>
        <div v-else class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700 leading-relaxed">
          收费模式已开启：C 端恢复 VIP 试看与付费墙逻辑，请确认下方支付接口与套餐配置正确。
        </div>
      </el-form>
    </el-card>

    <!-- Payment & Currency Configuration Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2 font-bold text-slate-800">
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
        <span class="font-bold text-slate-800">🎯 广告投放配置</span>
      </template>

      <el-form :model="settings" label-position="top">
        <el-form-item label="启用信息流广告（C 端视频流插卡）">
          <el-switch v-model="settings.adsEnabled" active-text="投放广告" inactive-text="不投放" />
        </el-form-item>
        <div v-if="settings.adsEnabled" class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700 leading-relaxed mb-3">
          广告仅对<b>非 VIP 用户</b>展示（VIP 免广告作为会员权益）。当前收费模式{{ settings.paywallEnabled ? '开启，VIP 用户免广告' : '关闭，所有用户均为免费身份（都会看到广告）' }}。
        </div>

        <el-form-item label="信息流广告间隔（每 N 条视频插 1 条广告）">
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
            <el-input-number v-model="settings.adsFeedInterval" :min="2" :max="20" :step="1" />
            <span class="text-xs text-slate-500">(默认 6，即每 6 条视频插入 1 条广告卡)</span>
          </div>
        </el-form-item>

        <el-form-item label="前贴片广告（preroll，正片播放前插播视频广告）">
          <el-switch v-model="settings.adsPrerollEnabled" active-text="开启" inactive-text="关闭（默认）" />
        </el-form-item>

        <el-form-item label="中插广告（midroll，正片进度过半插播一次视频广告）">
          <el-switch v-model="settings.adsMidrollEnabled" active-text="开启" inactive-text="关闭（默认）" />
        </el-form-item>

        <div class="text-xs text-slate-400">
          前贴片/中插为视频广告（需配置视频素材 URL），播放 5 秒后可跳过，VIP 用户自动免广告；广告位类型在「广告管理」中选择
        </div>
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
        </el-form-item><el-form-item label="启用拖拽进度条实时截图预览 (Seek Preview)">
          <el-switch v-model="settings.enableSeekPreview" active-text="开启悬浮缩略图" inactive-text="关闭缩略图" />
        </el-form-item>

        <el-form-item label="C 端调试日志 (Client Debug)">
          <el-switch v-model="settings.enableClientDebug" active-text="开启" inactive-text="关闭" />
          <div class="text-xs text-slate-400 mt-1">开启后 C 端浏览器 Console 输出全量 debug 日志（含播放器/代理地址），排查问题用；默认关闭</div>
        </el-form-item>

        <el-form-item label="默认全局备用存储节点地址">
          <el-input v-model="settings.activeStorageNodeUrl" placeholder="https://storage02.91cso.com" />
        </el-form-item>

        <el-form-item label="直传切片 TCP 并发连接数 (Concurrency Limit)">
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
            <el-input-number v-model="settings.uploadChunkConcurrency" :min="2" :max="8" :step="1" />
            <span class="text-xs text-slate-500">
            (默认 4 通道并行，在劣质跨国网络下推荐开至 4-6 通道突破单 TCP 拥塞瓶颈)
            </span>
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Log Level Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span class="font-bold text-slate-800">日志级别 (Log Level)</span>
          <el-tag :type="logLevel === 'debug' ? 'warning' : 'info'" size="small">当前: {{ logLevel }}</el-tag>
        </div>
      </template>

      <el-form label-position="top">
        <el-form-item label="服务端日志级别（立即生效，无需重启）">
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
            <el-select
              v-model="logLevel"
              :loading="logLevelLoading"
              style="width: 180px"
              @change="changeLogLevel"
            >
              <el-option v-for="lv in ['debug', 'info', 'warn', 'error']" :key="lv" :label="lv" :value="lv" />
            </el-select>
            <span class="text-xs text-slate-500">
              debug: 请求/响应全量追踪（本地排查用）；info: 一行式摘要（生产推荐）；warn/error: 仅告警与错误
            </span>
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Submit Save Button -->
    <div class="flex justify-stretch sm:justify-end">
      <el-button
        type="warning"
        size="large"
        class="font-bold px-8 py-3 rounded-xl shadow-md mobile-full-button"
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
import { apiFetch } from '../utils/api.js'

const saveLoading = ref(false)
const logLevel = ref('info')
const logLevelLoading = ref(false)
const settings = ref({
  paywallEnabled: false,
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
  enableClientDebug: false,
  uploadChunkConcurrency: 4,
  activeStorageNodeUrl: 'https://storage02.91cso.com',
  adsEnabled: false,
  adsFeedInterval: 6,
  adsPrerollEnabled: false,
  adsMidrollEnabled: false
})

const fetchSettings = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/settings')
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
  fetchLogLevel()
})

/** 拉取当前日志级别 */
const fetchLogLevel = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/loglevel')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data && json.data.level) {
        logLevel.value = json.data.level
      }
    }
  } catch (e) {}
}

/** 切换日志级别（立即生效） */
const changeLogLevel = async (level) => {
  logLevelLoading.value = true
  try {
    const res = await apiFetch('/api/v1/admin/loglevel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level })
    })
    const json = await res.json().catch(() => null)
    if (res.ok && json && json.data && json.data.level) {
      logLevel.value = json.data.level
      ElMessage.success('日志级别已切换: ' + json.data.level)
    } else {
      ElMessage.error(json?.message || '日志级别切换失败')
      fetchLogLevel()
    }
  } catch (e) {
    ElMessage.error('日志级别切换失败')
  } finally {
    logLevelLoading.value = false
  }
}

const saveSettings = async () => {
  saveLoading.value = true
  try {
    // 并发连接数强制收敛到 2-8 通道（防止 el-input-number 未失焦越界值入库）
    settings.value.uploadChunkConcurrency = Math.min(8, Math.max(2, Number(settings.value.uploadChunkConcurrency) || 4))
    const res = await apiFetch('/api/v1/admin/settings', {
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
