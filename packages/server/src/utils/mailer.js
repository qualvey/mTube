import { config } from '../config.js'

/**
 * 发送验证码邮件（Resend REST API，零依赖）
 * - 已配置 RESEND_API_KEY：真实发送
 * - 未配置（开发/测试）：不发送，返回 devMode=true（路由将 devCode 注入响应，便于本机联调）
 */
export const sendVerificationEmail = async ({ to, code }) => {
  if (!config.resend.apiKey) {
    console.log(`[Mailer] 开发模式（未配置 RESEND_API_KEY）：验证码 ${code} -> ${to}`)
    return { devMode: true }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resend.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: config.resend.from,
      to: [to],
      subject: '【StreamVIP】邮箱验证码',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #111; border-radius: 16px; color: #fff;">
          <h2 style="margin: 0 0 12px;">邮箱验证</h2>
          <p style="color: #aaa;">你的验证码是：</p>
          <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #facc15; margin: 12px 0;">${code}</div>
          <p style="color: #aaa; font-size: 13px;">验证码 5 分钟内有效。若非本人操作请忽略本邮件。</p>
        </div>`
    })
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend 发送失败 (${res.status}): ${body.slice(0, 200)}`)
  }
  return { devMode: false }
}
