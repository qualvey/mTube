<template>
  <!-- Login Page -->
  <div v-if="!isLoggedIn" class="min-h-screen bg-slate-900 flex items-center justify-center p-4">
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
        <el-button type="warning" class="w-full mt-4 font-bold text-base py-3 rounded-xl shadow-lg" :loading="loginLoading" @click="handleLogin">
          安全登录
        </el-button>
      </el-form>
      <div class="text-center mt-4 text-xs text-slate-500">
        账号密码可在 docker-compose.yml 环境变量配置
      </div>
    </el-card>
  </div>

  <!-- Admin Main Dashboard Layout -->
  <el-container v-else class="min-h-screen bg-slate-100">
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
          :default-active="activeTab"
          class="el-menu-vertical border-none bg-slate-900 text-slate-300"
          active-text-color="#f59e0b"
          background-color="#0f172a"
          text-color="#94a3b8"
          @select="(index) => activeTab = index"
        >
          <el-menu-item index="dashboard">
            <el-icon><DataAnalysis /></el-icon>
            <span>仪表盘概览</span>
          </el-menu-item>
          <el-menu-item index="analytics">
            <el-icon><Histogram /></el-icon>
            <span>全站浏览数据与日志</span>
          </el-menu-item>
          <el-menu-item index="videos">
            <el-icon><VideoCamera /></el-icon>
            <span>视频流管理</span>
          </el-menu-item>
          <el-menu-item index="paywall">
            <el-icon><Money /></el-icon>
            <span>VIP 套餐定价</span>
          </el-menu-item>
          <el-menu-item index="orders">
            <el-icon><Tickets /></el-icon>
            <span>订单流水对账</span>
          </el-menu-item>
          <el-menu-item index="settings">
            <el-icon><Setting /></el-icon>
            <span>系统与播放器设置</span>
          </el-menu-item>
        </el-menu>

      </div>

      <!-- User Logout Footer -->
      <div class="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div class="flex items-center gap-2">
          <el-avatar :size="28" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop" />
          <span>超级管理员</span>
        </div>
        <el-button type="text" class="text-rose-400 hover:text-rose-300" @click="handleLogout">退出</el-button>
      </div>
    </el-aside>

    <!-- Main Content Area -->
    <el-container>
      <el-header class="bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm">
        <h3 class="text-lg font-bold text-slate-800">
          {{ tabTitles[activeTab] }}
        </h3>
        <div class="flex items-center gap-3">
          <div class="px-3 py-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-mono font-semibold text-slate-600 flex items-center gap-1.5 shadow-inner">
            <span class="text-amber-500 font-bold">🕒</span>
            <span>{{ currentTime }}</span>
          </div>
          <el-tag type="warning" effect="dark" round>系统状态：正常运行中</el-tag>
        </div>
      </el-header>

      <el-main class="p-6">
        <!-- 1. Dashboard Tab -->
        <div v-if="activeTab === 'dashboard'" class="flex flex-col gap-6">
          <!-- Stat Cards -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <el-card class="rounded-xl shadow-sm border-slate-200">
              <div class="text-slate-500 text-xs mb-1">总视频数量</div>
              <div class="text-2xl font-black text-slate-900">{{ stats.totalVideos || 0 }} 部</div>
              <div class="text-xs text-amber-600 mt-2">含 VIP 专属视频 {{ stats.vipVideos || 0 }} 部</div>
            </el-card>
            <el-card class="rounded-xl shadow-sm border-slate-200">
              <div class="text-slate-500 text-xs mb-1">累计完成订单</div>
              <div class="text-2xl font-black text-slate-900">{{ stats.totalOrders || 0 }} 笔</div>
              <div class="text-xs text-emerald-600 mt-2">今日转化率 18.4%</div>
            </el-card>
            <el-card class="rounded-xl shadow-sm border-slate-200">
              <div class="text-slate-500 text-xs mb-1">平台累计营收</div>
              <div class="text-2xl font-black text-amber-600">¥{{ stats.totalRevenue || 0 }}</div>
              <div class="text-xs text-slate-400 mt-2">实时结算成功</div>
            </el-card>
            <el-card class="rounded-xl shadow-sm border-slate-200">
              <div class="text-slate-500 text-xs mb-1">今日浏览量 (PV)</div>
              <div class="text-2xl font-black text-slate-900">{{ stats.todayViews || 14208 }}</div>
              <div class="text-xs text-blue-500 mt-2">移动端占比 96%</div>
            </el-card>
          </div>

          <!-- Recent Videos Preview -->
          <el-card class="rounded-xl shadow-sm">
            <template #header>
              <div class="font-bold text-slate-800">最新在售视频列表</div>
            </template>
            <el-table :data="videoList.slice(0, 3)" style="width: 100%">
              <el-table-column prop="title" label="视频标题" min-width="200" />
              <el-table-column prop="author" label="创作者" width="140" />
              <el-table-column label="VIP专属" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.isVip ? 'danger' : 'info'">{{ row.isVip ? 'VIP独家' : '免费' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="likes" label="点赞数" width="100" />
            </el-table>
          </el-card>
        </div>

        <!-- 2. Video Manager Tab -->
        <div v-if="activeTab === 'videos'" class="flex flex-col gap-4">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <el-input v-model="searchKeyword" placeholder="搜索视频标题..." style="width: 240px" prefix-icon="Search" clearable />
              <el-select v-model="selectedTagFilter" placeholder="按标签筛选" clearable style="width: 160px">
                <el-option v-for="tag in allExistingTags" :key="tag" :label="tag" :value="tag" />
              </el-select>
            </div>
            <el-button type="warning" icon="Plus" class="font-bold" @click="showAddDialog = true">
              发布新视频
            </el-button>
          </div>

          <el-card class="rounded-xl shadow-sm">
            <el-table :data="filteredVideos" style="width: 100%" v-loading="loading">
              <el-table-column label="封面" width="90">
                <template #default="{ row }">
                  <img :src="row.poster" class="w-16 h-10 object-cover rounded-lg shadow-sm border border-slate-200" />
                </template>
              </el-table-column>
              <el-table-column prop="title" label="标题" min-width="200" />
              <el-table-column prop="author" label="创作者" width="120" />
              <el-table-column label="拉流拉取方式" width="140">
                <template #default="{ row }">
                  <el-tag v-if="row.headers && row.headers !== 'null' && row.headers !== '{}'" type="warning">
                    后端防盗链拉流
                  </el-tag>
                  <el-tag v-else-if="row.videoUrl && (row.videoUrl.includes('youtube.com') || row.videoUrl.includes('youtu.be'))" type="danger">
                    YouTube 代理
                  </el-tag>
                  <el-tag v-else type="info">直连播放</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="VIP 专属" width="110">
                <template #default="{ row }">
                  <el-switch v-model="row.isVip" @change="updateVideoVip(row)" />
                </template>
              </el-table-column>
              <el-table-column label="VIP 试看时长" width="130">
                <template #default="{ row }">
                  <span v-if="row.isVip" class="text-xs font-mono font-bold text-amber-600">
                    {{ row.previewDuration || 120 }}s ({{ Math.round((row.previewDuration || 120) / 60) }}分钟)
                  </span>
                  <span v-else class="text-xs text-slate-400">无限制</span>
                </template>
              </el-table-column>
              <el-table-column label="视频标签 (Tags)" min-width="160">
                <template #default="{ row }">
                  <div class="flex flex-wrap gap-1">
                    <el-tag 
                      v-for="tag in (Array.isArray(row.tags) ? row.tags : [])" 
                      :key="tag" 
                      size="small" 
                      type="warning" 
                      effect="plain"
                    >
                      {{ tag }}
                    </el-tag>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="likes" label="点赞量" width="90" />
              <el-table-column label="操作" width="160" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" size="small" icon="Edit" text @click="openEditDialog(row)">编辑</el-button>
                  <el-button type="danger" size="small" icon="Delete" text @click="deleteVideo(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>

        <!-- 3. Paywall Manager Tab -->
        <div v-if="activeTab === 'paywall'" class="flex flex-col gap-6 max-w-3xl">
          <el-card class="rounded-xl shadow-sm">
            <template #header>
              <div class="font-bold text-slate-800">C端付费墙套餐价格调整</div>
            </template>
            <el-form label-position="top" class="flex flex-col gap-4">
              <div v-for="(plan, index) in plans" :key="plan.id" class="p-4 border border-slate-200 rounded-xl bg-slate-50 flex flex-col gap-3">
                <div class="font-bold text-amber-600 flex items-center justify-between">
                  <span>{{ plan.name }}</span>
                  <el-tag v-if="plan.isHot" type="warning">热门推荐</el-tag>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <el-form-item label="套餐现价 (¥)">
                    <el-input-number v-model="plan.price" :min="1" :max="9999" />
                  </el-form-item>
                  <el-form-item label="套餐划线原价 (¥)">
                    <el-input-number v-model="plan.originalPrice" :min="1" :max="9999" />
                  </el-form-item>
                </div>
                <el-form-item label="套餐描述">
                  <el-input v-model="plan.description" />
                </el-form-item>
              </div>
              <el-button type="warning" class="w-full py-3 font-bold text-base mt-2" @click="savePlans">
                保存最新套餐定价
              </el-button>
            </el-form>
          </el-card>
        </div>

        <!-- 4. Orders Tab -->
        <div v-if="activeTab === 'orders'" class="flex flex-col gap-4">
          <el-card class="rounded-xl shadow-sm">
            <template #header>
              <div class="flex items-center justify-between flex-wrap gap-3">
                <div class="font-bold text-slate-800 flex items-center gap-2">
                  <span>💳 订单流水与设备 VIP 实时控制</span>
                </div>
                <div class="flex items-center gap-2">
                  <el-input 
                    v-model="quickDeviceIdInput" 
                    placeholder="输入设备指纹 ID (如 dev-...)" 
                    size="small" 
                    style="width: 240px" 
                    clearable 
                  />
                  <el-button type="warning" size="small" icon="Key" @click="quickGrantVip">手动赠送 VIP</el-button>
                  <el-button type="danger" size="small" icon="Remove" @click="quickCancelVip">取消该设备 VIP</el-button>
                </div>
              </div>
            </template>
            <el-table :data="orders" style="width: 100%">
              <el-table-column prop="id" label="订单号" width="160" />
              <el-table-column prop="planName" label="购买套餐" width="130" />
              <el-table-column label="支付金额" width="110">
                <template #default="{ row }">
                  <span class="font-bold text-amber-600">¥{{ row.amount }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="payType" label="支付通道" width="140">
                <template #default="{ row }">
                  <el-tag v-if="row.payType === 'alipay'" type="primary">支付宝</el-tag>
                  <el-tag v-else-if="row.payType === 'crypto_usdt'" type="success">USDT 加密货币</el-tag>
                  <el-tag v-else type="info">微信支付</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="设备指纹 ID" min-width="160">
                <template #default="{ row }">
                  <span class="font-mono text-xs text-slate-600 select-all">{{ row.deviceId || '未绑定设备' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="设备 VIP 状态" width="140">
                <template #default="{ row }">
                  <el-tag v-if="row.deviceId && row.isVip" type="success" size="small" effect="dark" class="font-bold">
                    👑 VIP 生效中
                  </el-tag>
                  <el-tag v-else-if="row.deviceId" type="info" size="small">
                    ⚪ 非 VIP / 已取消
                  </el-tag>
                  <span v-else class="text-slate-400 text-xs">-</span>
                </template>
              </el-table-column>
              <el-table-column label="恢复次数" width="90">
                <template #default="{ row }">
                  <el-tag :type="row.restoredCount > 0 ? 'warning' : 'info'" size="small">
                    {{ row.restoredCount || 0 }} 次
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="订单状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'PAID' ? 'success' : 'danger'">
                    {{ row.status === 'PAID' ? '已支付' : '待充值' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="createdAt" label="下单时间" min-width="170" />
              <el-table-column label="客服手动操作" width="290" fixed="right">
                <template #default="{ row }">
                  <el-button 
                    v-if="row.payType === 'crypto_usdt' && row.status !== 'PAID'" 
                    type="success" 
                    size="small" 
                    icon="Check" 
                    @click="confirmCryptoOrder(row)"
                  >
                    确认到账
                  </el-button>
                  <el-button 
                    type="warning" 
                    size="small" 
                    icon="Key" 
                    text 
                    @click="grantVipForOrder(row)"
                  >
                    {{ row.isVip ? '续期 VIP' : '开通/补发 VIP' }}
                  </el-button>
                  <el-button 
                    v-if="row.deviceId && row.isVip"
                    type="danger" 
                    size="small" 
                    icon="Remove" 
                    text 
                    @click="cancelVipForDevice(row.deviceId)"
                  >
                    取消 VIP
                  </el-button>
                  <el-popconfirm
                    title="确定要彻底删除此订单记录吗？删除后不可恢复！"
                    confirm-button-text="确定删除"
                    cancel-button-text="取消"
                    confirm-button-type="danger"
                    @confirm="deleteOrder(row.id)"
                  >
                    <template #reference>
                      <el-button 
                        type="danger" 
                        size="small" 
                        icon="Delete" 
                        text 
                        class="ml-2"
                      >
                        删除
                      </el-button>
                    </template>
                  </el-popconfirm>
                </template>
              </el-table-column>

            </el-table>
          </el-card>
        </div>

        <!-- 5. Settings Tab -->
        <div v-if="activeTab === 'settings'" class="flex flex-col gap-6 max-w-3xl">
          <!-- System Notice / Announcement Card -->
          <el-card class="rounded-xl shadow-sm border-slate-200">
            <template #header>
              <div class="font-bold text-slate-800 flex items-center justify-between">
                <span>C 端进入系统弹窗公告设置</span>
                <el-switch 
                  v-model="systemSettings.enableNotice" 
                  active-text="公告已启用" 
                  inactive-text="公告已禁用"
                  @change="saveSettings"
                />
              </div>
            </template>
            <el-form label-position="top" class="flex flex-col gap-4">
              <el-form-item label="公告弹窗标题">
                <el-input v-model="systemSettings.noticeTitle" placeholder="例如：📢 官方重要公告" />
              </el-form-item>
              <el-form-item label="公告详细内容">
                <el-input 
                  v-model="systemSettings.noticeContent" 
                  type="textarea" 
                  :rows="4" 
                  placeholder="请输入展现给 C 端用户的详细文字公告..." 
                />
              </el-form-item>
              <div class="flex justify-end mt-2">
                <el-button type="warning" class="font-bold px-6 py-2.5" @click="saveSettings">
                  保存系统公告配置
                </el-button>
              </div>
            </el-form>
          </el-card>

          <!-- Hero Banner Settings Card -->
          <el-card class="rounded-xl shadow-sm border-slate-200">
            <template #header>
              <div class="font-bold text-slate-800 flex items-center justify-between">
                <span>C 端首屏 (Hero Section) 封面海报与文案设置</span>
                <el-tag type="success">动态配置</el-tag>
              </div>
            </template>
            <el-form label-position="top" class="flex flex-col gap-4">
              <el-form-item label="Hero 背景图片 / GIF 链接">
                <div class="flex items-center gap-2">
                  <el-input 
                    v-model="systemSettings.heroImageUrl" 
                    placeholder="https://.../hero.jpg 或 /uploads/local-banner.jpg 或 .gif 图片地址" 
                  />
                  <input type="file" ref="heroImgInput" accept="image/*" class="hidden" @change="handleFileUpload($event, systemSettings, 'heroImageUrl')" />
                  <el-button type="primary" plain icon="Upload" :loading="uploadLoading" @click="$refs.heroImgInput.click()">上传本地图片</el-button>
                </div>
              </el-form-item>

              <!-- Image Preview Box -->
              <div v-if="systemSettings.heroImageUrl" class="relative w-full h-40 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shadow-inner">
                <img :src="systemSettings.heroImageUrl" class="w-full h-full object-cover" alt="Hero Preview" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                  <span class="text-white text-xs font-bold">首屏海报效果预览</span>
                </div>
              </div>

              <el-form-item label="C端网站 HTML 标题 (浏览器 title 标签)">
                <el-input v-model="systemSettings.siteTitle" placeholder="例如：StreamVIP - 独家超清视频流与VIP特权" />
              </el-form-item>

              <div class="grid grid-cols-2 gap-4">
                <el-form-item label="Hero 主标题">
                  <el-input v-model="systemSettings.heroTitle" placeholder="例如：极致诱惑" />
                </el-form-item>

                <el-form-item label="Hero 副标题描述">
                  <el-input v-model="systemSettings.heroSubtitle" placeholder="例如：滑动探索更多独家无删减内容" />
                </el-form-item>
              </div>


              <div class="flex justify-end mt-2">
                <el-button type="warning" class="font-bold px-6 py-2.5" @click="saveSettings">
                  保存首屏海报配置
                </el-button>
              </div>
            </el-form>
          </el-card>

          <!-- Alipay Merchant Settings Card -->
          <el-card class="rounded-xl shadow-sm border-slate-200">
            <template #header>
              <div class="font-bold text-slate-800 flex items-center justify-between">
                <span>支付宝开放平台支付配置 (Alipay Merchant Settings)</span>
                <el-tag type="primary">RSA2 安全密钥</el-tag>
              </div>
            </template>
            <el-form label-position="top" class="flex flex-col gap-4">
              <el-form-item label="支付宝 App ID">
                <el-input v-model="systemSettings.alipayAppId" placeholder="应用 App ID (如 202100...)" />
              </el-form-item>
              <el-form-item label="商户应用私钥 (App Private Key)">
                <el-input 
                  v-model="systemSettings.alipayPrivateKey" 
                  type="textarea" 
                  :rows="3" 
                  placeholder="-----BEGIN RSA PRIVATE KEY----- ..." 
                />
              </el-form-item>
              <el-form-item label="支付宝公钥 (Alipay Public Key)">
                <el-input 
                  v-model="systemSettings.alipayPublicKey" 
                  type="textarea" 
                  :rows="2" 
                  placeholder="-----BEGIN PUBLIC KEY----- ..." 
                />
              </el-form-item>
              <el-form-item label="异步通知回调地址 (notify_url)">
                <el-input v-model="systemSettings.alipayNotifyUrl" placeholder="http://domain.com/api/v1/paywall/alipay/notify" />
              </el-form-item>
              <div class="flex justify-end mt-2">
                <el-button type="primary" class="font-bold px-6 py-2.5" @click="saveSettings">
                  保存支付宝配置
                </el-button>
              </div>
            </el-form>
          </el-card>

          <!-- Crypto USDT Wallet Settings Card -->
          <el-card class="rounded-xl shadow-sm border-slate-200">
            <template #header>
              <div class="font-bold text-slate-800 flex items-center justify-between">
                <span>USDT 加密货币收款钱包配置 (Crypto USDT Wallet)</span>
                <el-tag type="success">TRC-20 (TRON)</el-tag>
              </div>
            </template>
            <el-form label-position="top" class="flex flex-col gap-4">
              <el-form-item label="TRC-20 USDT 收款钱包地址">
                <el-input v-model="systemSettings.cryptoUsdtAddress" placeholder="以 T 开头的 TRON 链 USDT 钱包地址" />
              </el-form-item>
              <el-form-item label="汇率折算 (1 USDT = ? CNY)">
                <el-input v-model="systemSettings.cryptoExchangeRate" placeholder="例如：7.2" />
              </el-form-item>
              <div class="flex justify-end mt-2">
                <el-button type="success" class="font-bold px-6 py-2.5" @click="saveSettings">
                  保存 USDT 钱包配置
                </el-button>
              </div>
            </el-form>
          </el-card>

          <!-- Player Global Settings Card -->
          <el-card class="rounded-xl shadow-sm border-slate-200">
            <template #header>
              <div class="font-bold text-slate-800 flex items-center justify-between">
                <span>播放器与系统全局设置</span>
                <el-tag type="warning">实时生效</el-tag>
              </div>
            </template>
            <el-form label-position="top" class="flex flex-col gap-4">
              <div class="p-4 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-between">
                <div>
                  <div class="font-bold text-slate-800 text-sm">进度条悬停帧预览 (Seek Sprite Preview)</div>
                  <div class="text-xs text-slate-500 mt-1 max-w-md">
                    开启后，C 端播放器划过进度条时悬停展示 10x10 精灵图切片缩略图；关闭后隐藏进度条悬停预览框。
                  </div>
                </div>
                <el-switch 
                  v-model="systemSettings.enableSeekPreview" 
                  active-text="已开启" 
                  inactive-text="已关闭"
                  @change="saveSettings"
                />
              </div>

              <div class="flex justify-end mt-2">
                <el-button type="warning" class="font-bold px-6 py-2.5" @click="saveSettings">
                  保存播放器设置
                </el-button>
              </div>
            </el-form>
          </el-card>
        </div>

        <!-- 6. Analytics & Logs Management Tab -->
        <div v-if="activeTab === 'analytics'" class="flex flex-col gap-6">
          <!-- Top Analytics Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <el-card class="rounded-xl shadow-sm border-slate-200 bg-gradient-to-br from-indigo-50 to-white">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-slate-500 text-xs font-medium mb-1">全站浏览量 (PV)</div>
                  <div class="text-2xl font-black text-indigo-700">{{ analyticsOverview.totalPV || 0 }}</div>
                  <div class="text-[11px] text-slate-400 mt-1">今日新增: <span class="font-bold text-indigo-600">+{{ analyticsOverview.todayPV || 0 }}</span></div>
                </div>
                <div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
                  📊
                </div>
              </div>
            </el-card>

            <el-card class="rounded-xl shadow-sm border-slate-200 bg-gradient-to-br from-emerald-50 to-white">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-slate-500 text-xs font-medium mb-1">独立访客数 (UV)</div>
                  <div class="text-2xl font-black text-emerald-700">{{ analyticsOverview.totalUV || 0 }}</div>
                  <div class="text-[11px] text-slate-400 mt-1">今日独立设备: <span class="font-bold text-emerald-600">+{{ analyticsOverview.todayUV || 0 }}</span></div>
                </div>
                <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg">
                  👤
                </div>
              </div>
            </el-card>

            <el-card class="rounded-xl shadow-sm border-slate-200 bg-gradient-to-br from-sky-50 to-white">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-slate-500 text-xs font-medium mb-1">独立来源 IP 数</div>
                  <div class="text-2xl font-black text-sky-700">{{ analyticsOverview.totalIPs || 0 }}</div>
                  <div class="text-[11px] text-slate-400 mt-1">今日来源 IP: <span class="font-bold text-sky-600">+{{ analyticsOverview.todayIPs || 0 }}</span></div>
                </div>
                <div class="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-lg">
                  🌐
                </div>
              </div>
            </el-card>

            <el-card class="rounded-xl shadow-sm border-slate-200 bg-gradient-to-br from-amber-50 to-white">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-slate-500 text-xs font-medium mb-1">视频总点击播放量</div>
                  <div class="text-2xl font-black text-amber-700">{{ analyticsOverview.totalClicks || 0 }}</div>
                  <div class="text-[11px] text-slate-400 mt-1">今日点击播放: <span class="font-bold text-amber-600">+{{ analyticsOverview.todayClicks || 0 }}</span></div>
                </div>
                <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-lg">
                  ▶️
                </div>
              </div>
            </el-card>
          </div>

          <!-- Trend Bar Chart & Top Videos Table -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- 7-Day Trend Chart -->
            <el-card class="lg:col-span-2 rounded-xl shadow-sm border-slate-200">
              <template #header>
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-800">📈 近 7 天全站 PV / UV 趋势曲线</span>
                  <el-tag size="small" type="info">自然日自动聚合</el-tag>
                </div>
              </template>
              <div class="py-4 px-2">
                <div class="flex items-end justify-between h-48 gap-3 pt-6 pb-2 border-b border-slate-100">
                  <div 
                    v-for="(date, idx) in analyticsTrend.dates" 
                    :key="date" 
                    class="flex-1 flex flex-col items-center gap-2 h-full justify-end group"
                  >
                    <!-- Visual Bars -->
                    <div class="w-full flex items-end justify-center gap-1.5 h-full max-h-36">
                      <!-- PV Bar -->
                      <div 
                        class="w-1/2 bg-indigo-500 rounded-t-md transition-all duration-300 group-hover:bg-indigo-600 relative flex justify-center"
                        :style="{ height: `${Math.max(12, Math.min(100, ((analyticsTrend.pv[idx] || 0) / (Math.max(...analyticsTrend.pv, 1))) * 100))}%` }"
                      >
                        <span class="absolute -top-5 text-[10px] font-bold text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          {{ analyticsTrend.pv[idx] || 0 }}
                        </span>
                      </div>
                      <!-- UV Bar -->
                      <div 
                        class="w-1/2 bg-emerald-500 rounded-t-md transition-all duration-300 group-hover:bg-emerald-600 relative flex justify-center"
                        :style="{ height: `${Math.max(12, Math.min(100, ((analyticsTrend.uv[idx] || 0) / (Math.max(...analyticsTrend.uv, 1))) * 100))}%` }"
                      >
                        <span class="absolute -top-5 text-[10px] font-bold text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          {{ analyticsTrend.uv[idx] || 0 }}
                        </span>
                      </div>
                    </div>
                    <span class="text-[11px] text-slate-500 font-medium">{{ date }}</span>
                  </div>
                </div>
                <div class="flex items-center justify-center gap-6 mt-4 text-xs">
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
                    <img :src="v.poster" class="w-10 h-7 rounded object-cover border shrink-0" />
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

          <!-- Real-Time GeoIP Access Logs Table & Controls -->
          <el-card class="rounded-xl shadow-sm border-slate-200">
            <template #header>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-slate-800">🌐 实时访问日志与 GeoIP 来源列表</span>
                  <el-tag type="success" size="small">默认永久保留</el-tag>
                </div>

                <!-- Log Filter & Clean Toolbar -->
                <div class="flex items-center gap-2 flex-wrap">
                  <el-input 
                    v-model="logSearchIp" 
                    placeholder="按 IP 搜索" 
                    size="small"
                    style="width: 140px;"
                    clearable
                    @change="fetchAnalyticsData"
                  />
                  <el-select 
                    v-model="logSearchAction" 
                    placeholder="操作类型" 
                    size="small" 
                    style="width: 120px;"
                    clearable
                    @change="fetchAnalyticsData"
                  >
                    <el-option label="全部动作" value="" />
                    <el-option label="页面浏览 (PV)" value="PV" />
                    <el-option label="视频点击" value="VIDEO_CLICK" />
                  </el-select>
                  <el-button type="primary" size="small" icon="Search" @click="fetchAnalyticsData">查询</el-button>

                  <el-popconfirm 
                    title="确定要一键清空测试日志吗？(默认不自动清理)" 
                    confirm-button-text="确定清理"
                    cancel-button-text="取消"
                    @confirm="handleClearLogs(true)"
                  >
                    <template #reference>
                      <el-button type="danger" plain size="small" icon="Delete">清理日志</el-button>
                    </template>
                  </el-popconfirm>
                </div>
              </div>
            </template>

            <!-- Access Logs Table -->
            <el-table :data="accessLogs" stripe style="width: 100%" size="small">
              <el-table-column prop="id" label="ID" width="70" />
              <el-table-column prop="ip" label="来源 IP" width="140">
                <template #default="{ row }">
                  <span class="font-mono font-bold text-slate-700">{{ row.ip }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="location" label="IP 归属地 (GeoIP)" width="150">
                <template #default="{ row }">
                  <el-tag size="small" type="info" effect="plain" class="font-medium">
                    📍 {{ row.location || '未知位置' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="action" label="访问类型" width="110">
                <template #default="{ row }">
                  <el-tag v-if="row.action === 'VIDEO_CLICK'" type="warning" size="small" effect="dark">
                    ▶ 视频点击
                  </el-tag>
                  <el-tag v-else type="primary" size="small">
                    👁 页面浏览
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="videoId" label="视频关联 ID" width="140">
                <template #default="{ row }">
                  <span v-if="row.videoId" class="font-mono text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    {{ row.videoId }}
                  </span>
                  <span v-else class="text-slate-400">-</span>
                </template>
              </el-table-column>
              <el-table-column prop="deviceId" label="设备指纹 (UV)" width="160">
                <template #default="{ row }">
                  <span class="font-mono text-[11px] text-slate-500 truncate block max-w-[140px]" :title="row.deviceId">
                    {{ row.deviceId || '无设备指纹' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="createdAt" label="访问时间" width="170">
                <template #default="{ row }">
                  <span class="font-mono text-xs text-slate-600">{{ new Date(row.createdAt).toLocaleString() }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="userAgent" label="User-Agent / Referer">
                <template #default="{ row }">
                  <div class="text-[11px] text-slate-500 truncate max-w-xs" :title="row.userAgent">
                    {{ row.userAgent }}
                  </div>
                </template>
              </el-table-column>
            </el-table>

            <!-- Pagination Toolbar -->
            <div class="flex items-center justify-between mt-4 text-xs text-slate-500">
              <div>
                共记录 <span class="font-bold text-slate-800">{{ accessLogsTotal }}</span> 条日志 (系统默认不做自动物理删除)
              </div>
              <el-pagination
                v-model:current-page="accessLogsPage"
                v-model:page-size="accessLogsPageSize"
                layout="prev, pager, next"
                :total="accessLogsTotal"
                @current-change="fetchAnalyticsData"
              />
            </div>
          </el-card>
        </div>
      </el-main>
    </el-container>
  </el-container>


  <!-- Add Video Dialog (with Predefined Referer & User-Agent Fields) -->
  <el-dialog v-model="showAddDialog" title="发布新视频资源" width="580px">
    <el-form :model="newVideoForm" label-position="top">
      <el-form-item label="视频标题" required>
        <el-input v-model="newVideoForm.title" placeholder="例如：【4K原画】独家高能剪辑" />
      </el-form-item>
      <el-form-item label="视频描述">
        <el-input v-model="newVideoForm.description" type="textarea" :rows="2" placeholder="详细视频简介" />
      </el-form-item>
      <el-form-item label="创作者名称">
        <el-input v-model="newVideoForm.author" placeholder="官方创作者" />
      </el-form-item>
      <el-form-item label="视频 MP4 / M3U8 播放地址" required>
        <div class="flex items-center gap-2">
          <el-input v-model="newVideoForm.videoUrl" placeholder="https://.../video.mp4 或 /uploads/... 或 YouTube 链接" />
          <input type="file" ref="addVideoInput" accept="video/*,.m3u8,.mp4,.mov,.webm" class="hidden" @change="handleFileUpload($event, newVideoForm, 'videoUrl')" />
          <el-button type="primary" plain icon="Upload" :loading="uploadLoading" @click="$refs.addVideoInput.click()">上传本地视频</el-button>
        </div>
      </el-form-item>

      <!-- Predefined Request Headers UI Component Block -->
      <div class="p-4 border border-amber-200 bg-amber-50/50 rounded-xl flex flex-col gap-3 my-2">
        <div class="text-xs font-bold text-amber-800 flex items-center gap-1.5">
          <span>🔒 自定义请求头配置 (Predefined Request Headers)</span>
        </div>

        <el-form-item label="Referer (防盗链来源页)">
          <el-input 
            v-model="newVideoForm.referer" 
            placeholder="例如：https://missav.ws/dm48/cn/bf-720-uncensored-leak" 
          />
        </el-form-item>

        <el-form-item label="User-Agent (客户端签名)">
          <el-input 
            v-model="newVideoForm.userAgent" 
            type="textarea"
            :rows="2"
            :placeholder="DEFAULT_UA" 
          />
          <div class="text-[11px] text-slate-500 mt-1">
            提示：若为空则默认使用：<code class="text-amber-800 bg-amber-100/80 px-1 py-0.5 rounded font-mono">{{ DEFAULT_UA }}</code>
          </div>
        </el-form-item>
      </div>

      <el-form-item label="封面图片地址">
        <div class="flex items-center gap-2">
          <el-input v-model="newVideoForm.poster" placeholder="https://.../poster.jpg 或 /uploads/..." />
          <input type="file" ref="addPosterInput" accept="image/*" class="hidden" @change="handleFileUpload($event, newVideoForm, 'poster')" />
          <el-button type="primary" plain icon="Upload" :loading="uploadLoading" @click="$refs.addPosterInput.click()">上传本地封面</el-button>
        </div>
      </el-form-item>
      <el-form-item label="视频分类标签 (Tags)">
        <el-select
          v-model="newVideoForm.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入新标签 (按 Enter 创建)"
          style="width: 100%"
        >
          <el-option
            v-for="item in availableTagOptions"
            :key="item"
            :label="item"
            :value="item"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="VIP 专属限制">
        <el-switch v-model="newVideoForm.isVip" active-text="仅 VIP 可播放" inactive-text="免费公开试看" />
      </el-form-item>
      <el-form-item v-if="newVideoForm.isVip" label="VIP 试看时长限制 (秒)">
        <el-input-number v-model="newVideoForm.previewDuration" :min="10" :max="3600" :step="10" />
        <span class="text-xs text-slate-500 ml-2">
          (默认 120 秒 / 2 分钟，试看超时后自动暂停并弹窗锁屏)
        </span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddDialog = false">取消</el-button>
      <el-button type="warning" class="font-bold" @click="submitAddVideo">立即提交发布</el-button>
    </template>
  </el-dialog>

  <!-- Edit Video Dialog (with Predefined Referer & User-Agent Fields) -->
  <el-dialog v-model="showEditDialog" title="编辑视频资源信息" width="580px">
    <el-form :model="editVideoForm" label-position="top">
      <el-form-item label="视频标题" required>
        <el-input v-model="editVideoForm.title" placeholder="例如：【4K原画】独家高能剪辑" />
      </el-form-item>
      <el-form-item label="视频描述">
        <el-input v-model="editVideoForm.description" type="textarea" :rows="2" placeholder="详细视频简介" />
      </el-form-item>
      <el-form-item label="创作者名称">
        <el-input v-model="editVideoForm.author" placeholder="官方创作者" />
      </el-form-item>
      <el-form-item label="创作者头像 URL">
        <el-input v-model="editVideoForm.authorAvatar" placeholder="https://.../avatar.jpg" />
      </el-form-item>
      <el-form-item label="视频 MP4 / M3U8 播放地址" required>
        <div class="flex items-center gap-2">
          <el-input v-model="editVideoForm.videoUrl" placeholder="https://.../video.m3u8 或 MP4 或 YouTube 链接" />
          <input type="file" ref="editVideoInput" accept="video/*,.m3u8,.mp4,.mov,.webm" class="hidden" @change="handleFileUpload($event, editVideoForm, 'videoUrl')" />
          <el-button type="primary" plain icon="Upload" :loading="uploadLoading" @click="$refs.editVideoInput.click()">上传本地视频</el-button>
        </div>
      </el-form-item>

      <!-- Predefined Request Headers UI Component Block -->
      <div class="p-4 border border-amber-200 bg-amber-50/50 rounded-xl flex flex-col gap-3 my-2">
        <div class="text-xs font-bold text-amber-800 flex items-center gap-1.5">
          <span>🔒 自定义请求头配置 (Predefined Request Headers)</span>
        </div>

        <el-form-item label="Referer (防盗链来源页)">
          <el-input 
            v-model="editVideoForm.referer" 
            placeholder="例如：https://missav.ws/dm48/cn/bf-720-uncensored-leak" 
          />
        </el-form-item>

        <el-form-item label="User-Agent (客户端签名)">
          <el-input 
            v-model="editVideoForm.userAgent" 
            type="textarea"
            :rows="2"
            :placeholder="DEFAULT_UA" 
          />
          <div class="text-[11px] text-slate-500 mt-1">
            提示：若为空则默认使用：<code class="text-amber-800 bg-amber-100/80 px-1 py-0.5 rounded font-mono">{{ DEFAULT_UA }}</code>
          </div>
        </el-form-item>
      </div>

      <el-form-item label="封面图片地址">
        <div class="flex items-center gap-2">
          <el-input v-model="editVideoForm.poster" placeholder="https://.../poster.jpg 或 /uploads/..." />
          <input type="file" ref="editPosterInput" accept="image/*" class="hidden" @change="handleFileUpload($event, editVideoForm, 'poster')" />
          <el-button type="primary" plain icon="Upload" :loading="uploadLoading" @click="$refs.editPosterInput.click()">上传本地封面</el-button>
        </div>
      </el-form-item>
      <el-form-item label="视频时长">
        <el-input v-model="editVideoForm.duration" placeholder="例如：05:00" />
      </el-form-item>
      <el-form-item label="视频分类标签 (Tags)">
        <el-select
          v-model="editVideoForm.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入新标签 (按 Enter 创建)"
          style="width: 100%"
        >
          <el-option
            v-for="item in availableTagOptions"
            :key="item"
            :label="item"
            :value="item"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="VIP 专属限制">
        <el-switch v-model="editVideoForm.isVip" active-text="仅 VIP 可播放" inactive-text="免费公开试看" />
      </el-form-item>
      <el-form-item v-if="editVideoForm.isVip" label="VIP 试看时长限制 (秒)">
        <el-input-number v-model="editVideoForm.previewDuration" :min="10" :max="3600" :step="10" />
        <span class="text-xs text-slate-500 ml-2">
          (默认 120 秒 / 2 分钟，试看超时后自动暂停并弹窗锁屏)
        </span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showEditDialog = false">取消</el-button>
      <el-button type="warning" class="font-bold" @click="submitEditVideo">保存更新</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

const currentTime = ref('')
let clockTimer = null

const updateClock = () => {
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
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})

const isLoggedIn = ref(false)
const loginLoading = ref(false)
const loginForm = ref({ username: '', password: '' })

const activeTab = ref('dashboard')
const tabTitles = {
  dashboard: '📊 平台数据概览',
  analytics: '📈 全站浏览数据与日志管理',
  videos: '🎬 视频流内容管理',
  paywall: '💎 VIP 付费墙定价管理',
  orders: '💳 订单流水与对账',
  settings: '⚙️ 系统与播放器设置'
}

const loading = ref(false)
const stats = ref({})
const videoList = ref([])
const plans = ref([])
const orders = ref([])

// Analytics & Access Logs state
const analyticsOverview = ref({
  totalPV: 0, todayPV: 0,
  totalUV: 0, todayUV: 0,
  totalIPs: 0, todayIPs: 0,
  totalClicks: 0, todayClicks: 0
})
const analyticsTrend = ref({ dates: [], pv: [], uv: [], ips: [], clicks: [] })
const topVideos = ref([])
const accessLogs = ref([])
const accessLogsTotal = ref(0)
const accessLogsPage = ref(1)
const accessLogsPageSize = ref(15)
const logSearchIp = ref('')
const logSearchAction = ref('')
const clearBeforeDate = ref('')

const systemSettings = ref({
  siteTitle: 'StreamVIP - 独家超清视频流与VIP特权',
  enableSeekPreview: true,

  heroImageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop',
  heroTitle: '极致诱惑',
  heroSubtitle: '滑动探索更多独家无删减内容',
  alipayAppId: '',
  alipayPrivateKey: '',
  alipayPublicKey: '',
  alipayNotifyUrl: 'http://localhost:3000/api/v1/paywall/alipay/notify',
  cryptoUsdtAddress: 'TY7x9N2m8Qk4Pz1v6W3s5R7u9Y2X4B6C8V',

  cryptoExchangeRate: '7.2',
  enableNotice: true,
  noticeTitle: '📢 官方重要公告',
  noticeContent: '欢迎来到 StreamVIP 独家流媒体平台！升级尊享 VIP 会员可无限制观看全站无删减 4K 超清原画库！客服在线时间：10:00 - 24:00。'
})
const searchKeyword = ref('')
const uploadLoading = ref(false)

const handleFileUpload = async (event, targetObj, fieldName) => {
  const file = event.target.files[0]
  if (!file) return

  uploadLoading.value = true
  try {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64Data = e.target.result
      const res = await fetch('/api/v1/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          fileData: base64Data
        })
      })
      const json = await res.json()
      if (res.ok && json.data && json.data.url) {
        // Safely set property on Vue 3 ref or reactive object
        const target = (targetObj && typeof targetObj === 'object' && 'value' in targetObj)
          ? targetObj.value
          : targetObj
        target[fieldName] = json.data.url
        ElMessage.success(`本地文件 ${file.name} 上传成功！已生成路径: ${json.data.url}`)
      } else {
        ElMessage.error(json.message || '文件上传失败')
      }
      uploadLoading.value = false
    }
    reader.readAsDataURL(file)
  } catch (err) {
    ElMessage.error('上传读取异常: ' + err.message)
    uploadLoading.value = false
  } finally {
    event.target.value = ''
  }
}
const selectedTagFilter = ref('')
const presetTagOptions = ['4K画质', '赛博朋克', '视觉盛宴', 'VIP独家', '免费试看', '热血', '无删减', '新增', '纪录片', '幕后花絮']

const allExistingTags = computed(() => {
  const set = new Set(presetTagOptions)
  videoList.value.forEach(v => {
    if (Array.isArray(v.tags)) {
      v.tags.forEach(t => t && set.add(String(t).trim()))
    }
  })
  return Array.from(set)
})

const availableTagOptions = computed(() => allExistingTags.value)

// Add Video Modal State
const showAddDialog = ref(false)
const newVideoForm = ref({
  title: '',
  description: '',
  author: '官方创作者',
  videoUrl: '',
  referer: '',
  userAgent: '',
  poster: '',
  isVip: true,
  previewDuration: 120,
  tags: ['新增']
})

// Edit Video Modal State
const showEditDialog = ref(false)
const editVideoForm = ref({
  id: '',
  title: '',
  description: '',
  author: '',
  authorAvatar: '',
  videoUrl: '',
  referer: '',
  userAgent: '',
  poster: '',
  duration: '',
  isVip: false,
  previewDuration: 120,
  tags: []
})

const handleLogin = async () => {
  loginLoading.value = true
  try {
    const res = await fetch('/api/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm.value)
    })
    const json = await res.json()
    if (json.code === 200) {
      isLoggedIn.value = true
      ElMessage.success('登录成功，欢迎使用 StreamVIP 管理台！')
      loadAllData()
    } else {
      ElMessage.error(json.message || '登录失败')
    }
  } catch (e) {
    ElMessage.error('无法连接到后端服务器')
  } finally {
    loginLoading.value = false
  }
}

const handleLogout = () => {
  isLoggedIn.value = false
  ElMessage.info('已安全退出登录')
}

const fetchAnalyticsData = async () => {
  try {
    const [overviewRes, trendRes, topVideosRes, logsRes] = await Promise.all([
      fetch('/api/v1/admin/analytics/overview').then(r => r.json()),
      fetch('/api/v1/admin/analytics/trend?days=7').then(r => r.json()),
      fetch('/api/v1/admin/analytics/top-videos?limit=10').then(r => r.json()),
      fetch(`/api/v1/admin/analytics/logs?page=${accessLogsPage.value}&pageSize=${accessLogsPageSize.value}&ip=${encodeURIComponent(logSearchIp.value)}&action=${encodeURIComponent(logSearchAction.value)}`).then(r => r.json())
    ])

    if (overviewRes.code === 200) analyticsOverview.value = overviewRes.data
    if (trendRes.code === 200) analyticsTrend.value = trendRes.data
    if (topVideosRes.code === 200) topVideos.value = topVideosRes.data
    if (logsRes.code === 200) {
      accessLogs.value = logsRes.data.list
      accessLogsTotal.value = logsRes.data.total
    }
  } catch (e) {
    console.error('Failed to load analytics data:', e)
  }
}

const handleClearLogs = async (clearAll = false) => {
  try {
    const body = clearAll ? { clearAll: true } : { beforeDate: clearBeforeDate.value }
    const res = await fetch('/api/v1/admin/analytics/logs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json())

    if (res.code === 200) {
      ElMessage.success(`日志管理清理成功，已处理 ${res.data.deletedCount} 条记录`)
      fetchAnalyticsData()
    } else {
      ElMessage.error(res.message || '清理逻辑响应失败')
    }
  } catch (e) {
    ElMessage.error('清理日志失败: ' + e.message)
  }
}

const loadAllData = async () => {
  loading.value = true
  try {
    const [statsRes, videosRes, plansRes, ordersRes, settingsRes] = await Promise.all([
      fetch('/api/v1/admin/dashboard/stats').then(r => r.json()),
      fetch('/api/v1/admin/videos').then(r => r.json()),
      fetch('/api/v1/admin/paywall/plans').then(r => r.json()),
      fetch('/api/v1/admin/orders').then(r => r.json()),
      fetch('/api/v1/admin/settings').then(r => r.json())
    ])

    if (statsRes.data) stats.value = statsRes.data
    if (videosRes.data) videoList.value = videosRes.data
    if (plansRes.data) plans.value = plansRes.data
    if (ordersRes.data) orders.value = ordersRes.data
    if (settingsRes.data) systemSettings.value = settingsRes.data

    fetchAnalyticsData()
  } catch (e) {
    console.warn('Load data error:', e)
  } finally {
    loading.value = false
  }
}


const filteredVideos = computed(() => {
  let list = videoList.value
  if (searchKeyword.value) {
    list = list.filter(v => v.title.includes(searchKeyword.value))
  }
  if (selectedTagFilter.value) {
    list = list.filter(v => Array.isArray(v.tags) && v.tags.includes(selectedTagFilter.value))
  }
  return list
})

const updateVideoVip = async (video) => {
  try {
    await fetch(`/api/v1/admin/videos/${video.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isVip: video.isVip })
    })
    ElMessage.success(`已更新 ${video.title} 的 VIP 限制状态`)
  } catch (e) {
    ElMessage.error('状态更新失败')
  }
}

const deleteVideo = async (id) => {
  try {
    await fetch(`/api/v1/admin/videos/${id}`, { method: 'DELETE' })
    videoList.value = videoList.value.filter(v => v.id !== id)
    ElMessage.success('视频已成功下架/删除')
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

const buildHeadersJson = (referer, userAgent) => {
  const obj = {}
  if (referer && referer.trim()) {
    obj['Referer'] = referer.trim()
  }
  const finalUa = userAgent && userAgent.trim() ? userAgent.trim() : DEFAULT_UA
  obj['User-Agent'] = finalUa

  return JSON.stringify(obj, null, 2)
}

const submitAddVideo = async () => {
  if (!newVideoForm.value.title || !newVideoForm.value.videoUrl) {
    ElMessage.warning('请填写完整的标题和视频播放地址')
    return
  }

  const headersJson = buildHeadersJson(newVideoForm.value.referer, newVideoForm.value.userAgent)

  try {
    const res = await fetch('/api/v1/admin/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newVideoForm.value,
        headers: headersJson
      })
    })
    const json = await res.json()
    if (json.data) {
      videoList.value.unshift(json.data)
      showAddDialog.value = false
      newVideoForm.value = { title: '', description: '', author: '官方创作者', videoUrl: '', referer: '', userAgent: '', poster: '', isVip: true, previewDuration: 120, tags: ['新增'] }
      ElMessage.success('新视频发布成功！')
    }
  } catch (e) {
    ElMessage.error('发布失败')
  }
}

const openEditDialog = (video) => {
  let refererVal = ''
  let userAgentVal = ''

  if (video.headers) {
    let parsed = {}
    if (typeof video.headers === 'object') {
      parsed = video.headers
    } else {
      try {
        parsed = JSON.parse(video.headers)
      } catch {
        // ignore
      }
    }

    refererVal = parsed['Referer'] || parsed['referer'] || ''
    userAgentVal = parsed['User-Agent'] || parsed['user-agent'] || ''
  }

  editVideoForm.value = {
    id: video.id,
    title: video.title || '',
    description: video.description || '',
    author: video.author || '官方创作者',
    authorAvatar: video.authorAvatar || '',
    videoUrl: video.videoUrl || '',
    referer: refererVal,
    userAgent: userAgentVal || DEFAULT_UA,
    poster: video.poster || '',
    duration: video.duration || '05:00',
    isVip: !!video.isVip,
    previewDuration: video.previewDuration !== undefined && video.previewDuration !== null ? Number(video.previewDuration) : 120,
    tags: Array.isArray(video.tags) ? [...video.tags] : []
  }
  showEditDialog.value = true
}

const submitEditVideo = async () => {
  if (!editVideoForm.value.title || !editVideoForm.value.videoUrl) {
    ElMessage.warning('请填写完整的标题和视频播放地址')
    return
  }

  const headersJson = buildHeadersJson(editVideoForm.value.referer, editVideoForm.value.userAgent)

  try {
    const res = await fetch(`/api/v1/admin/videos/${editVideoForm.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editVideoForm.value,
        headers: headersJson
      })
    })
    const json = await res.json()
    if (json.code === 200 && json.data) {
      const index = videoList.value.findIndex(v => v.id === editVideoForm.value.id)
      if (index !== -1) {
        videoList.value[index] = { ...videoList.value[index], ...json.data }
      }
      showEditDialog.value = false
      ElMessage.success(`视频《${json.data.title}》信息已成功更新！`)
    } else {
      ElMessage.error(json.message || '更新失败')
    }
  } catch (e) {
    ElMessage.error('无法保存视频更新，请检查网络或后端接口')
  }
}

const savePlans = async () => {
  try {
    await fetch('/api/v1/admin/paywall/plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plans: plans.value })
    })
    ElMessage.success('VIP 套餐最新定价已成功保存并同步至 C 端！')
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

const confirmCryptoOrder = async (order) => {
  try {
    const res = await fetch(`/api/v1/admin/orders/${order.id}/confirm-crypto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeNo: `USDT-CONFIRM-${Date.now()}` })
    })
    const json = await res.json()
    if (json.code === 200) {
      ElMessage.success(`订单 ${order.id} 已确认收到 USDT 汇款并成功补发 VIP！`)
    }
  } catch (e) {
    ElMessage.error('确认失败')
  }
}

const deleteOrder = async (orderId) => {
  if (!orderId) return
  try {
    const res = await fetch(`/api/v1/admin/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    })
    const json = await res.json()
    if (json.code === 200) {
      ElMessage.success(`订单 [${orderId}] 已成功删除`)
      loadAllData()
    } else {
      ElMessage.error(json.message || '删除订单失败')
    }
  } catch (e) {
    ElMessage.error('删除订单网络请求失败')
  }
}

const quickDeviceIdInput = ref('')

const cancelVipForDevice = async (deviceId) => {
  if (!deviceId) {
    ElMessage.warning('缺少设备 ID')
    return
  }
  try {
    const res = await fetch(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke-vip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const json = await res.json()
    if (json.code === 200) {
      ElMessage.success(`设备 [${deviceId}] 的 VIP 权限已成功取消！`)
      loadAllData()
    } else {
      ElMessage.error(json.message || '取消 VIP 失败')
    }
  } catch (e) {
    ElMessage.error('取消设备 VIP 失败，请检查后端网络')
  }
}

const quickGrantVip = async () => {
  if (!quickDeviceIdInput.value) {
    ElMessage.warning('请输入要开通 VIP 的设备指纹 ID')
    return
  }
  try {
    const res = await fetch(`/api/v1/admin/devices/${encodeURIComponent(quickDeviceIdInput.value)}/grant-vip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'month' })
    })
    const json = await res.json()
    if (json.code === 200) {
      ElMessage.success(`设备 [${quickDeviceIdInput.value}] 已成功手动赠送 VIP 权限！`)
      quickDeviceIdInput.value = ''
      loadAllData()
    } else {
      ElMessage.error(json.message || '赠送失败')
    }
  } catch (e) {
    ElMessage.error('赠送 VIP 失败，请检查后端')
  }
}

const quickCancelVip = async () => {
  if (!quickDeviceIdInput.value) {
    ElMessage.warning('请输入要取消 VIP 的设备指纹 ID')
    return
  }
  await cancelVipForDevice(quickDeviceIdInput.value)
  quickDeviceIdInput.value = ''
}

const grantVipForOrder = async (order) => {
  try {
    const res = await fetch(`/api/v1/admin/orders/${order.id}/grant-vip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: order.deviceId })
    })
    const json = await res.json()
    if (json.code === 200) {
      ElMessage.success(`已成功为订单 ${order.id} (设备 ${order.deviceId || '设备'}) 手动开通/恢复 VIP！`)
      loadAllData()
    }
  } catch (e) {
    ElMessage.error('授权失败')
  }
}

const saveSettings = async () => {
  try {
    const res = await fetch('/api/v1/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(systemSettings.value)
    })
    const json = await res.json()
    if (json.data) {
      systemSettings.value = json.data
      ElMessage.success('播放器设置已成功更新并同步至 C 端！')
    }
  } catch (e) {
    ElMessage.error('保存设置失败')
  }
}
</script>
