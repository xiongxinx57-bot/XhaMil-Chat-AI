/** 验证码邮件 HTML 模板 — 全套简洁风（table 布局，兼容主流邮箱客户端） */

export const DEFAULT_EMAIL_TEMPLATE_ID = 'classic'

export const EMAIL_TEMPLATE_META = [
  { id: 'classic', name: '素白居中', description: '白底居中，灰底验证码，最通用' },
  { id: 'minimal', name: '留白左齐', description: '左对齐、细竖线，信息密度低' },
  { id: 'gradient', name: '浅灰分位', description: '浅灰底 + 分位验证码，干净清晰' },
  { id: 'warm', name: '细线署名', description: '标题细线分隔，署名在底' },
  { id: 'dark', name: '深色简版', description: '深灰卡片，白字验证码' },
  { id: 'letterhead', name: '单行顶栏', description: '极细顶栏 + 左对齐正文' }
]

const ALLOWED = new Set(EMAIL_TEMPLATE_META.map((t) => t.id))

export function normalizeEmailTemplateId(value) {
  const id = String(value || '').trim()
  return ALLOWED.has(id) ? id : DEFAULT_EMAIL_TEMPLATE_ID
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function spacedCode(code) {
  return String(code).replace(/\s/g, '').split('').join(' ')
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif"

function shell({ bg, inner }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${bg};font-family:${FONT};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${bg};padding:28px 16px;">
    <tr><td align="center">${inner}</td></tr>
  </table>
</body>
</html>`
}

function simpleFooter(brand, color = '#9ca3af') {
  return `<tr><td style="padding:16px 28px 22px;text-align:center;font-size:11px;line-height:1.5;color:${color};">${brand} · 系统自动发送，请勿回复</td></tr>`
}

/** 素白居中 */
function renderClassic({ code, min, brand }) {
  return shell({
    bg: '#f5f5f5',
    inner: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" style="max-width:100%;background:#ffffff;border:1px solid #eaeaea;border-radius:8px;">
      <tr><td style="padding:28px 28px 8px;text-align:center;font-size:16px;font-weight:600;color:#111111;">邮箱验证码</td></tr>
      <tr><td style="padding:16px 28px;text-align:center;">
        <div style="display:inline-block;padding:12px 22px;background:#f5f5f5;border-radius:6px;font-size:28px;font-weight:700;letter-spacing:0.28em;color:#111111;font-variant-numeric:tabular-nums;">${code}</div>
      </td></tr>
      <tr><td style="padding:4px 28px 0;text-align:center;font-size:13px;line-height:1.6;color:#6b7280;">${min} 分钟内有效，非本人操作请忽略</td></tr>
      ${simpleFooter(brand)}
    </table>`
  })
}

/** 留白左齐 */
function renderMinimal({ code, min, brand }) {
  return shell({
    bg: '#fafafa',
    inner: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" style="max-width:100%;background:#ffffff;border:1px solid #eeeeee;">
      <tr><td style="padding:28px 32px;border-left:2px solid #111111;">
        <div style="font-size:12px;color:#9ca3af;margin-bottom:14px;">邮箱验证</div>
        <div style="font-size:30px;font-weight:600;letter-spacing:0.24em;color:#111111;font-variant-numeric:tabular-nums;margin-bottom:14px;">${code}</div>
        <div style="font-size:13px;line-height:1.7;color:#6b7280;">请在 ${min} 分钟内完成验证。如非本人操作，请忽略此邮件。</div>
        <div style="margin-top:22px;font-size:11px;color:#9ca3af;">${brand}</div>
      </td></tr>
    </table>`
  })
}

/** 浅灰分位 */
function renderGradient({ code, min, brand }) {
  const codeSpaced = spacedCode(code)
  return shell({
    bg: '#f5f5f5',
    inner: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" style="max-width:100%;background:#ffffff;border:1px solid #eaeaea;border-radius:8px;">
      <tr><td style="padding:28px 28px 10px;font-size:15px;font-weight:600;color:#111111;">${brand} 邮箱验证</td></tr>
      <tr><td style="padding:0 28px 8px;font-size:13px;color:#6b7280;">您的验证码为：</td></tr>
      <tr><td style="padding:0 28px 16px;">
        <div style="padding:14px 16px;background:#f5f5f5;border-radius:6px;font-size:26px;font-weight:700;letter-spacing:0.28em;color:#111111;font-variant-numeric:tabular-nums;">${codeSpaced}</div>
      </td></tr>
      <tr><td style="padding:0 28px 8px;font-size:13px;line-height:1.7;color:#6b7280;">该验证码 ${min} 分钟内有效。</td></tr>
      ${simpleFooter(brand)}
    </table>`
  })
}

/** 细线署名 */
function renderWarm({ code, min, brand }) {
  return shell({
    bg: '#f5f5f5',
    inner: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" style="max-width:100%;background:#ffffff;border:1px solid #eaeaea;border-radius:8px;">
      <tr><td style="padding:28px 28px 0;text-align:center;">
        <div style="font-size:14px;font-weight:600;color:#111111;">${brand}</div>
        <div style="width:24px;height:1px;background:#d1d5db;margin:12px auto 0;"></div>
      </td></tr>
      <tr><td style="padding:18px 28px 6px;text-align:center;font-size:13px;color:#6b7280;">验证码</td></tr>
      <tr><td style="padding:0 28px 10px;text-align:center;font-size:30px;font-weight:700;letter-spacing:0.26em;color:#111111;font-variant-numeric:tabular-nums;">${code}</td></tr>
      <tr><td style="padding:0 28px 6px;text-align:center;font-size:12px;color:#9ca3af;">${min} 分钟内有效</td></tr>
      ${simpleFooter(brand)}
    </table>`
  })
}

/** 深色简版 */
function renderDark({ code, min, brand }) {
  return shell({
    bg: '#111111',
    inner: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="440" style="max-width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;">
      <tr><td style="padding:28px 28px 8px;text-align:center;font-size:15px;font-weight:600;color:#f5f5f5;">邮箱验证码</td></tr>
      <tr><td style="padding:12px 28px;text-align:center;">
        <div style="display:inline-block;padding:12px 22px;background:#111111;border:1px solid #2a2a2a;border-radius:6px;font-size:28px;font-weight:700;letter-spacing:0.28em;color:#ffffff;font-variant-numeric:tabular-nums;">${code}</div>
      </td></tr>
      <tr><td style="padding:4px 28px 0;text-align:center;font-size:12px;line-height:1.6;color:#9ca3af;">${min} 分钟内有效 · 请勿转发</td></tr>
      ${simpleFooter(brand, '#6b7280')}
    </table>`
  })
}

/** 单行顶栏 */
function renderLetterhead({ code, min, brand }) {
  return shell({
    bg: '#f5f5f5',
    inner: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:100%;background:#ffffff;border:1px solid #e5e7eb;">
      <tr><td style="padding:12px 24px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#111111;">${brand}</td></tr>
      <tr><td style="padding:28px 24px 8px;font-size:18px;font-weight:600;color:#111111;">邮箱验证码</td></tr>
      <tr><td style="padding:8px 24px 20px;font-size:14px;line-height:1.8;color:#4b5563;">
        您的验证码是 <strong style="color:#111111;letter-spacing:0.08em;">${code}</strong>，请在 ${min} 分钟内完成验证。如非本人操作，请忽略此邮件。
      </td></tr>
      <tr><td style="padding:12px 24px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;">系统自动发送，请勿回复</td></tr>
    </table>`
  })
}

const RENDERERS = {
  classic: renderClassic,
  minimal: renderMinimal,
  gradient: renderGradient,
  warm: renderWarm,
  dark: renderDark,
  letterhead: renderLetterhead
}

export function renderVerificationEmailHtml(templateId, opts = {}) {
  const id = normalizeEmailTemplateId(templateId)
  const code = escapeHtml(opts.code ?? '000000')
  const min = escapeHtml(String(opts.validMin ?? opts.min ?? 5))
  const brand = escapeHtml(opts.brand || opts.fromName || 'XhaMil Chat')
  const logo = escapeHtml(String(opts.logo || '').trim())
  const logoUrl = opts.logoUrl ? escapeHtml(String(opts.logoUrl).trim()) : ''
  const render = RENDERERS[id] || RENDERERS.classic
  return render({ code, min, brand, logo, logoUrl })
}

export function listEmailTemplatesForAdmin(opts = {}) {
  const brand = String(opts.brand || 'XhaMil').trim() || 'XhaMil'
  const logo = String(opts.logo || '').trim()
  const logoUrl = String(opts.logoUrl || '').trim()
  return EMAIL_TEMPLATE_META.map((t) => ({
    ...t,
    previewHtml: renderVerificationEmailHtml(t.id, {
      code: '123456',
      validMin: 5,
      brand,
      logo,
      logoUrl
    })
  }))
}
