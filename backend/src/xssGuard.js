/** 用户输入 XSS / HTML 注入检测（拒绝提交，不静默剥离） */

const XSS_PATTERNS = [
  /[<>]/,
  /&(?:lt|gt|#0*60|#0*62|#x0*3c|#x0*3e)\b/i,
  /<\s*\/?\s*[a-z][\w:-]*\b/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\s*\/\s*html/i,
  /\bon(?:abort|blur|change|click|dblclick|error|focus|input|keydown|keypress|keyup|load|mousedown|mouseenter|mouseleave|mousemove|mouseout|mouseover|mouseup|reset|resize|scroll|select|submit|toggle|unload|animation\w*)\s*=/i,
  /expression\s*\(/i,
  /url\s*\(\s*['"]?\s*javascript/i
]

function buildXssError(field) {
  const err = new Error(`${field}包含不允许的脚本或 HTML 代码，请修改后重试`)
  err.status = 400
  return err
}

export function containsXssPayload(value) {
  if (value == null || value === '') return false
  const text = String(value)
  return XSS_PATTERNS.some((re) => re.test(text))
}

export function assertNoXssPayload(value, { field = '内容', allowEmpty = true } = {}) {
  if (value == null || value === '') {
    if (!allowEmpty) throw buildXssError(field)
    return
  }
  if (containsXssPayload(value)) throw buildXssError(field)
}

export function assertChatMessageContent(content) {
  assertNoXssPayload(content, { field: '消息', allowEmpty: false })
}

export function assertUserDisplayName(name, field = '昵称') {
  assertNoXssPayload(name, { field, allowEmpty: false })
}

export function assertGroupDisplayName(name, field = '群名称') {
  assertNoXssPayload(name, { field, allowEmpty: false })
}
