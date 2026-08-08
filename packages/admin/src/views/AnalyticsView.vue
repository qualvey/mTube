<template>
  <div class="analytics-page" v-loading="loading">
    <div class="analytics-toolbar">
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-lg font-bold text-slate-900">数据分析</h2>
          <el-tag size="small" type="info" effect="plain">UTC</el-tag>
        </div>
        <p class="text-xs text-slate-500 mt-1">{{ periodLabel }}</p>
      </div>
      <div class="analytics-actions">
        <el-radio-group v-model="days" size="small" @change="fetchReport">
          <el-radio-button :value="7">7 天</el-radio-button>
          <el-radio-button :value="30">30 天</el-radio-button>
          <el-radio-button :value="90">90 天</el-radio-button>
        </el-radio-group>
        <el-button :icon="Refresh" size="small" aria-label="刷新数据" @click="fetchReport" />
      </div>
    </div>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
    />

    <div class="metric-grid">
      <div v-for="metric in metrics" :key="metric.key" class="metric-card">
        <div class="metric-card__top">
          <span class="metric-card__label">{{ metric.label }}</span>
          <span class="metric-card__icon" :class="`metric-card__icon--${metric.tone}`">
            <el-icon><component :is="metric.icon" /></el-icon>
          </span>
        </div>
        <div class="metric-card__value">{{ metric.value }}</div>
        <div class="metric-card__compare" :class="metric.change.className">
          <el-icon v-if="metric.change.direction === 'up'"><Top /></el-icon>
          <el-icon v-else-if="metric.change.direction === 'down'"><Bottom /></el-icon>
          <el-icon v-else><Minus /></el-icon>
          <span>{{ metric.change.text }}</span>
          <span class="text-slate-400">较上期</span>
        </div>
      </div>
    </div>

    <div class="analytics-main-grid">
      <section class="analytics-panel analytics-panel--wide">
        <div class="panel-heading">
          <div>
            <h3>核心指标趋势</h3>
            <p>PV、UV 与 2 秒有效播放</p>
          </div>
          <div class="chart-legend">
            <span><i class="legend-pv"></i>PV</span>
            <span><i class="legend-uv"></i>UV</span>
            <span><i class="legend-view"></i>有效播放</span>
          </div>
        </div>

        <div v-if="hasTrendData" class="trend-scroll">
          <div class="trend-chart" :style="{ width: trendWidth }">
            <div v-for="point in trend" :key="point.date" class="trend-column">
              <div class="trend-bars">
                <div class="trend-bar trend-bar--pv" :style="barStyle(point.pv)" :title="`${point.date} PV: ${formatNumber(point.pv)}`"></div>
                <div class="trend-bar trend-bar--uv" :style="barStyle(point.uv)" :title="`${point.date} UV: ${formatNumber(point.uv)}`"></div>
                <div class="trend-bar trend-bar--view" :style="barStyle(point.validViews)" :title="`${point.date} 有效播放: ${formatNumber(point.validViews)}`"></div>
              </div>
              <span class="trend-label">{{ showDateLabel(point.index) ? point.date.slice(5) : '' }}</span>
            </div>
          </div>
        </div>
        <el-empty v-else description="所选时段暂无趋势数据" :image-size="72" />
      </section>

      <section class="analytics-panel">
        <div class="panel-heading">
          <div>
            <h3>播放漏斗</h3>
            <p>按播放事件阶段统计</p>
          </div>
          <el-tag size="small" type="success" effect="plain">有效口径</el-tag>
        </div>
        <div v-if="funnel.some(item => item.value > 0)" class="funnel-list">
          <div v-for="item in funnel" :key="item.key" class="funnel-item">
            <div class="funnel-item__meta">
              <span>{{ item.label }}</span>
              <strong>{{ formatNumber(item.value) }} <small>{{ formatPercent(item.rate) }}</small></strong>
            </div>
            <div class="funnel-track">
              <span :style="{ width: `${Math.max(item.rate * 100, item.value ? 2 : 0)}%` }"></span>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无播放漏斗数据" :image-size="72" />
      </section>
    </div>

    <div class="analytics-secondary-grid">
      <section class="analytics-panel">
        <div class="panel-heading">
          <div>
            <h3>设备构成</h3>
            <p>按页面浏览量统计</p>
          </div>
        </div>
        <div v-if="devices.length" class="device-list">
          <div v-for="device in devices" :key="device.device" class="device-row">
            <div class="device-row__meta">
              <span>{{ deviceLabel(device.device) }}</span>
              <strong>{{ formatNumber(device.pv) }} <small>PV</small></strong>
            </div>
            <div class="device-track">
              <span :style="{ width: `${device.share * 100}%` }"></span>
            </div>
            <div class="device-row__footer">
              <span>{{ formatNumber(device.uv) }} UV</span>
              <span>{{ formatPercent(device.share) }}</span>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无设备数据" :image-size="72" />
      </section>

      <section class="analytics-panel">
        <div class="panel-heading">
          <div>
            <h3>页面排行</h3>
            <p>访问量最高的页面路径</p>
          </div>
          <el-tag size="small" type="info" effect="plain">Top 10</el-tag>
        </div>
        <div v-if="topPaths.length" class="path-list">
          <div v-for="(item, index) in topPaths" :key="item.path" class="path-row">
            <span class="rank-badge">{{ index + 1 }}</span>
            <span class="path-row__path" :title="item.path">{{ item.path }}</span>
            <span class="path-row__metric">{{ formatNumber(item.pv) }} <small>PV</small></span>
            <span class="path-row__metric path-row__metric--muted">{{ formatNumber(item.uv) }} <small>UV</small></span>
          </div>
        </div>
        <el-empty v-else description="暂无页面访问数据" :image-size="72" />
      </section>
    </div>

    <section class="analytics-panel">
      <div class="panel-heading">
        <div>
          <h3>视频消费排行</h3>
          <p>按 2 秒有效播放排序</p>
        </div>
        <el-tag size="small" type="warning" effect="plain">Top 10</el-tag>
      </div>
      <div v-if="topVideos.length" class="admin-table-scroll">
        <el-table :data="topVideos" stripe class="analytics-video-table">
          <el-table-column type="index" label="#" width="54" />
          <el-table-column label="视频" min-width="260">
            <template #default="scope">
              <div class="video-cell">
                <img v-if="scope.row.poster" :src="scope.row.poster" alt="" />
                <div v-else class="video-cell__placeholder"><el-icon><VideoCamera /></el-icon></div>
                <div class="min-w-0">
                  <div class="video-cell__title">{{ scope.row.title }}</div>
                  <div class="video-cell__meta">
                    <span>{{ scope.row.author || '未设置作者' }}</span>
                    <el-tag v-if="scope.row.isVip" size="small" type="warning">VIP</el-tag>
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="starts" label="开始播放" width="110" align="right">
            <template #default="scope">{{ formatNumber(scope.row.starts) }}</template>
          </el-table-column>
          <el-table-column prop="validViews" label="有效播放" width="110" align="right">
            <template #default="scope"><strong>{{ formatNumber(scope.row.validViews) }}</strong></template>
          </el-table-column>
          <el-table-column label="观看时长" width="130" align="right">
            <template #default="scope">{{ formatDuration(scope.row.watchSeconds) }}</template>
          </el-table-column>
          <el-table-column label="完播率" width="110" align="right">
            <template #default="scope">{{ formatPercent(scope.row.validViews ? scope.row.completes / scope.row.validViews : 0) }}</template>
          </el-table-column>
        </el-table>
      </div>
      <el-empty v-else description="暂无视频消费数据" :image-size="72" />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { apiFetch } from '../utils/api.js'

const days = ref(7)
const loading = ref(false)
const errorMessage = ref('')
const report = ref({
  range: null,
  summary: {},
  previous: {},
  trend: [],
  funnel: {},
  topVideos: [],
  topPaths: [],
  devices: []
})

const formatNumber = value => new Intl.NumberFormat('zh-CN').format(Number(value || 0))
const formatPercent = value => `${(Number(value || 0) * 100).toFixed(1)}%`
const formatDuration = seconds => {
  const total = Math.round(Number(seconds || 0))
  if (total < 60) return `${total} 秒`
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`
}
const formatAverage = seconds => `${Number(seconds || 0).toFixed(1)} 秒`

const changeFor = (current, previous) => {
  const currentValue = Number(current || 0)
  const previousValue = Number(previous || 0)
  if (currentValue === previousValue) {
    return { text: '持平', direction: 'flat', className: 'is-flat' }
  }
  if (!previousValue) {
    return { text: '新增', direction: 'up', className: 'is-up' }
  }
  const percent = Math.abs((currentValue - previousValue) / previousValue) * 100
  const direction = currentValue > previousValue ? 'up' : 'down'
  return {
    text: `${percent.toFixed(1)}%`,
    direction,
    className: direction === 'up' ? 'is-up' : 'is-down'
  }
}

const metrics = computed(() => {
  const current = report.value.summary || {}
  const previous = report.value.previous || {}
  return [
    { key: 'pv', label: '页面浏览量', value: formatNumber(current.pv), icon: 'View', tone: 'blue', change: changeFor(current.pv, previous.pv) },
    { key: 'uv', label: '独立访客', value: formatNumber(current.uv), icon: 'User', tone: 'green', change: changeFor(current.uv, previous.uv) },
    { key: 'validViews', label: '2 秒有效播放', value: formatNumber(current.validViews), icon: 'VideoPlay', tone: 'amber', change: changeFor(current.validViews, previous.validViews) },
    { key: 'watchSeconds', label: '有效观看时长', value: formatDuration(current.watchSeconds), icon: 'Clock', tone: 'cyan', change: changeFor(current.watchSeconds, previous.watchSeconds) },
    { key: 'completionRate', label: '完播率', value: formatPercent(current.completionRate), icon: 'PieChart', tone: 'rose', change: changeFor(current.completionRate, previous.completionRate) },
    { key: 'averageWatchSeconds', label: '次均观看时长', value: formatAverage(current.averageWatchSeconds), icon: 'Timer', tone: 'slate', change: changeFor(current.averageWatchSeconds, previous.averageWatchSeconds) }
  ]
})

const trend = computed(() => (report.value.trend || []).map((item, index) => ({ ...item, index })))
const trendMax = computed(() => Math.max(1, ...trend.value.flatMap(item => [item.pv, item.uv, item.validViews])))
const hasTrendData = computed(() => trend.value.some(item => item.pv || item.uv || item.validViews))
const trendWidth = computed(() => `${Math.max(620, trend.value.length * 30)}px`)
const barStyle = value => ({ height: value ? `${Math.max(2, (value / trendMax.value) * 100)}%` : '0' })
const showDateLabel = index => {
  const interval = Math.max(1, Math.ceil(days.value / 7))
  return index % interval === 0 || index === trend.value.length - 1
}

const funnel = computed(() => {
  const source = report.value.funnel || {}
  const starts = Number(source.starts || 0)
  const items = [
    ['starts', '开始播放'],
    ['validViews', '2 秒有效播放'],
    ['progress25', '观看 25%'],
    ['progress50', '观看 50%'],
    ['progress75', '观看 75%'],
    ['completes', '完整播放']
  ]
  return items.map(([key, label]) => {
    const value = Number(source[key] || 0)
    return { key, label, value, rate: starts ? Math.min(1, value / starts) : 0 }
  })
})

const devices = computed(() => {
  const rows = report.value.devices || []
  const total = rows.reduce((sum, item) => sum + Number(item.pv || 0), 0)
  return rows.map(item => ({ ...item, share: total ? Number(item.pv || 0) / total : 0 }))
})
const topVideos = computed(() => report.value.topVideos || [])
const topPaths = computed(() => report.value.topPaths || [])
const deviceLabel = device => ({ desktop: '桌面端', mobile: '移动端', tablet: '平板', unknown: '未知设备' }[device] || device)

const periodLabel = computed(() => {
  const range = report.value.range
  if (!range) return `最近 ${days.value} 天`
  const end = new Date(new Date(range.endAt).getTime() - 1)
  return `${range.startAt.slice(0, 10)} 至 ${end.toISOString().slice(0, 10)} · 最近 ${range.days} 天`
})

const fetchReport = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch(`/api/v1/admin/analytics/v1/report?days=${days.value}`)
    const payload = await response.json()
    if (!response.ok || !payload.data) throw new Error(payload.message || '数据加载失败')
    report.value = payload.data
  } catch (error) {
    errorMessage.value = error.message || '数据加载失败'
    ElMessage.error(errorMessage.value)
  } finally {
    loading.value = false
  }
}

onMounted(fetchReport)
</script>

<style scoped>
.analytics-page { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.analytics-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.analytics-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.metric-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.metric-card, .analytics-panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 2px rgb(15 23 42 / 0.04); }
.metric-card { padding: 16px; min-width: 0; }
.metric-card__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.metric-card__label { color: #64748b; font-size: 12px; font-weight: 700; white-space: nowrap; }
.metric-card__icon { width: 30px; height: 30px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.metric-card__icon--blue { color: #2563eb; background: #dbeafe; }
.metric-card__icon--green { color: #059669; background: #d1fae5; }
.metric-card__icon--amber { color: #d97706; background: #fef3c7; }
.metric-card__icon--cyan { color: #0891b2; background: #cffafe; }
.metric-card__icon--rose { color: #e11d48; background: #ffe4e6; }
.metric-card__icon--slate { color: #475569; background: #e2e8f0; }
.metric-card__value { color: #0f172a; font-size: 24px; line-height: 1.15; font-weight: 800; margin-top: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.metric-card__compare { display: flex; align-items: center; gap: 3px; margin-top: 10px; font-size: 11px; font-weight: 700; }
.metric-card__compare.is-up { color: #059669; }
.metric-card__compare.is-down { color: #e11d48; }
.metric-card__compare.is-flat { color: #64748b; }
.analytics-main-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); gap: 16px; }
.analytics-secondary-grid { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(0, 2fr); gap: 16px; }
.analytics-panel { padding: 18px; min-width: 0; }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid #f1f5f9; }
.panel-heading h3 { color: #1e293b; font-size: 14px; line-height: 1.3; font-weight: 800; }
.panel-heading p { color: #94a3b8; font-size: 11px; margin-top: 3px; }
.chart-legend { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; color: #64748b; font-size: 11px; }
.chart-legend span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.chart-legend i { width: 8px; height: 8px; border-radius: 2px; }
.legend-pv { background: #2563eb; }.legend-uv { background: #10b981; }.legend-view { background: #f59e0b; }
.trend-scroll { overflow-x: auto; padding-top: 18px; }
.trend-chart { height: 250px; display: flex; align-items: stretch; gap: 6px; border-bottom: 1px solid #cbd5e1; }
.trend-column { flex: 1; min-width: 22px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.trend-bars { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
.trend-bar { width: 5px; max-height: 100%; border-radius: 2px 2px 0 0; transition: height 180ms ease; }
.trend-bar--pv { background: #2563eb; }.trend-bar--uv { background: #10b981; }.trend-bar--view { background: #f59e0b; }
.trend-label { height: 24px; padding-top: 7px; color: #64748b; font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.funnel-list, .device-list { display: flex; flex-direction: column; gap: 15px; padding-top: 18px; }
.funnel-item__meta, .device-row__meta, .device-row__footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.funnel-item__meta { color: #475569; font-size: 12px; }
.funnel-item__meta strong, .device-row__meta strong { color: #0f172a; font-size: 12px; }
.funnel-item__meta small, .device-row__meta small { color: #94a3b8; font-weight: 500; margin-left: 3px; }
.funnel-track, .device-track { height: 7px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-top: 6px; }
.funnel-track span { display: block; height: 100%; background: #f59e0b; border-radius: 3px; }
.device-row__meta { color: #475569; font-size: 12px; }
.device-track span { display: block; height: 100%; background: #0891b2; border-radius: 3px; }
.device-row__footer { color: #94a3b8; font-size: 10px; margin-top: 5px; }
.path-list { display: flex; flex-direction: column; padding-top: 8px; }
.path-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 72px 72px; align-items: center; gap: 8px; min-height: 40px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
.path-row:last-child { border-bottom: 0; }
.rank-badge { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; color: #64748b; background: #f1f5f9; font-size: 10px; font-weight: 800; }
.path-row__path { color: #334155; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.path-row__metric { color: #0f172a; text-align: right; font-weight: 700; white-space: nowrap; }
.path-row__metric small { color: #94a3b8; font-size: 9px; font-weight: 500; }
.path-row__metric--muted { color: #64748b; }
.analytics-video-table { min-width: 780px; margin-top: 8px; }
.video-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.video-cell img, .video-cell__placeholder { width: 54px; height: 34px; border-radius: 4px; flex-shrink: 0; }
.video-cell img { object-fit: cover; background: #e2e8f0; }
.video-cell__placeholder { display: flex; align-items: center; justify-content: center; color: #94a3b8; background: #f1f5f9; }
.video-cell__title { color: #1e293b; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.video-cell__meta { display: flex; align-items: center; gap: 6px; color: #94a3b8; font-size: 10px; margin-top: 3px; }

@media (max-width: 1279px) {
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 899px) {
  .analytics-main-grid, .analytics-secondary-grid { grid-template-columns: 1fr; }
}
@media (max-width: 639px) {
  .analytics-page { gap: 12px; }
  .analytics-toolbar { align-items: stretch; flex-direction: column; }
  .analytics-actions { justify-content: space-between; }
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .metric-card { padding: 12px; }
  .metric-card__value { font-size: 19px; margin-top: 12px; }
  .metric-card__icon { width: 26px; height: 26px; }
  .analytics-panel { padding: 14px; }
  .panel-heading { align-items: center; }
  .chart-legend { gap: 7px; }
  .trend-chart { height: 220px; }
  .path-row { grid-template-columns: 24px minmax(0, 1fr) 60px; }
  .path-row__metric--muted { display: none; }
}
</style>
