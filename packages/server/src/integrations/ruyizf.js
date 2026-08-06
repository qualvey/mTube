import crypto from 'node:crypto';

/**
 * 计算 MD5 大写签名 (ASCII 字典序排序 + secret 拼接)
 * @param {Record<string, any>} params - 请求参数
 * @param {string} secret - 商户密钥
 * @returns {string} MD5 签名 (大写)
 */
export function ruyizfSign(params, secret) {
  // 过滤掉 undefined, null 及空值（避免未定义字段参与签名）
  const keys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort(); // 默认按 ASCII 码升序排序

  const queryString = keys.map((k) => `${k}=${params[k]}`).join('&');
  const signStr = `${queryString}&secret=${secret}`;

  return crypto.createHash('md5').update(signStr, 'utf8').digest('hex').toUpperCase();
}

/**
 * 创建如意支付客户端
 * @param {Object} config
 * @param {string} config.apiUrl - 接口基础地址 (如: https://api.TCXCY.ruyizf.xyz)
 * @param {string} config.mch - 商户号 (如: M100406697)
 * @param {string} config.secret - 商户 Secret
 * @param {typeof fetch} [config.customFetch] - 自定义 fetch 实现 (方便 Node 环境测试或扩展)
 */
export function createRuyizfClient({ apiUrl, mch, secret, customFetch = fetch }) {
  if (!apiUrl || !mch || !secret) {
    throw new Error('ruyizfClient 初始化失败：apiUrl, mch 和 secret 为必填项');
  }

  // 规范化 baseUrl，去掉末尾斜杠
  const baseUrl = apiUrl.replace(/\/+$/, '');

  /**
   * 发送 POST 请求并自动填充 mch、reqTime 以及计算 sign
   * @param {string} path - 请求路径 (如: /pay)
   * @param {Record<string, any>} [params={}] - 额外业务参数
   * @returns {Promise<any>}
   */
  async function post(path, params = {}) {
    const formattedPath = path.startsWith('/') ? path : `/${path}`;
    const targetUrl = `${baseUrl}${formattedPath}`;

    // 组合默认参数与业务参数
    const fullParams = {
      mch,
      reqTime: Date.now(),
      ...params,
    };

    // 生成签名
    const sign = ruyizfSign(fullParams, secret);
    const payload = { ...fullParams, sign };

    const response = await customFetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}. Response: ${errorText}`);
    }

    return response.json();
  }

  /**
   * 快捷下单接口 (代收下单)
   * @param {Object} options
   * @param {number} options.amount - 金额 (单位：元)
   * @param {string} [options.code="4444"] - 通道编码
   * @param {string} options.notify - 异步回调地址
   * @param {string} options.clientIP - 客户端 IP
   * @param {string} [options.orderid] - 订单号，不传则使用时间戳自动生成
   */
  async function createPayOrder({ amount, code = '4444', notify, clientIP, orderid }) {
    if (!amount || amount <= 0) {
      throw new Error('下单失败：amount 必须大于 0');
    }

    const price = Math.round(amount * 100); // 元转分
    const orderId = orderid || Date.now().toString();

    return post('/pay', {
      code,
      orderid: orderId,
      price,
      notify,
      clientIP,
    });
  }

  // 返回暴露的公开方法
  return {
    post,
    createPayOrder,
  };
}