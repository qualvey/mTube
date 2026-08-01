# 项目未来架构与演进路线规划文档 (Future Roadmap)

本文档归档了平台后续版本的核心功能架构设计与升级规划。

---

## 1. 波场 TRC-20 自动化能量租赁与 Gas 优化系统 (TRON Energy Rental System)

### 1.1 痛点背景与问题分析
在 TRON (TRC-20) 链上使用 USDT 结算支付时：
- **普通转账开销大**：转移 TRC-20 USDT 需要消耗 **65,000 ~ 130,000 Energy**。如果付款用户钱包中**没有 Energy**，TRON 主网会自动**燃烧 13.4 ~ 26.8 TRX（约 $3.5 ~ $7.0 美元）** 作为昂贵的手续费。
- **用户支付报错**：若用户钱包中连 TRX 余额都没有，转账直接触发 `OUT_OF_ENERGY` 报错失败，导致极其严重的用户流失。

### 1.2 解决方案：商家端自动化能量派发 (Delegation)
通过对接第三方能量平台 API（如 Feee.io / TronEnergy.market）或搭建商户质押池：
- 商家在 C 端用户请求加密货币支付时，通过后台 API **自动为用户/收款地址租赁 65,000 能量（1小时有效）**。
- **开销降幅达 85%**：租用 65,000 能量的成本仅为 **~1.5 TRX（约 $0.25 美元）**。
- **零门槛体验**：即使付款用户钱包 0 TRX 也能畅通转账。

### 1.3 技术设计与接口规范

#### A. 后端能量服务组件 (`packages/server/src/tronEnergy.js`)
```javascript
import fetch from 'node-fetch'
import { logger } from './logger.js'

export const tronEnergyService = {
  /**
   * 为指定付款钱包地址自动租赁 65,000 能量 (1小时有效)
   * @param {string} userAddress 用户的 TRC-20 钱包地址
   * @param {string} apiKey 能量平台授权 Key
   */
  async rentEnergyForAddress(userAddress, apiKey = '') {
    if (!userAddress || !userAddress.startsWith('T')) {
      logger.warn(`[Energy Rental] 无效的 TRC-20 地址: ${userAddress}`)
      return false
    }

    try {
      logger.info(`[Energy Rental] 正在为地址 ${userAddress} 自动租用 65,000 能量...`)
      const response = await fetch('https://api.feee.io/v1/order/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          receive_address: userAddress,
          energy_amount: 65000,
          rent_time: '1h'
        })
      })

      const data = await response.json()
      if (data && (data.code === 200 || data.status === 'success')) {
        logger.info(`[Energy Rental] 能量已成功派发至 ${userAddress}`)
        return true
      }
    } catch (e) {
      logger.error(`[Energy Rental] 派发能量异常: ${e.message}`)
    }
    return false
  }
}
```

#### B. 数据库配置扩展 (`db.js`)
- `enableEnergyRental`: 布尔开关（是否开启自动派发能量）。
- `energyApiKey`: 能量平台的 API Key。
- `energyRentAmount`: 能量额度（默认 `65000`）。

---

## 2. Web3 钱包直连 1 键签名支付 (Web3 Wallet Connect)

- 引入 `@tronweb3/truedapp` / `TronLink` JS SDK。
- 在移动端/PC端提供 **“连接 TronLink / TokenPocket 钱包一键转账”** 按钮。
- 自动唤起钱包 App，用户只需点击“确认授权”，避免复制地址与手输金额出错。

---

## 3. Telegram Bot 订单通知与客服一键处理

- 对接 Telegram Bot API (`https://api.telegram.org/bot<TOKEN>/sendMessage`)。
- 当有用户发起 USDT 或支付宝支付时，后台自动推送 Telegram 消息至管理员频道。
- 管理员可在 Telegram 聊天框中直接点击 `[内测开通 VIP]` 或 `[确认 USDT 到账]` 按钮完成审核。

---

## 4. 视频流代理多节点负载均衡 (Multi-Proxy Edge Load Balancing)

- 扩充 `stream_proxy_architecture.md` 中设计的内存流代理架构。
- 引入支持高并发的 Node.js Cluster 多进程或 Nginx Edge 缓存节点。
- 实现针对Surrit / YouTube 内存流的切片并发预加载与多边缘节点均衡分发。
