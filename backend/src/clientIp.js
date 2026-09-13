/** 获取客户端 IP（优先 X-Forwarded-For 首段） */
export function getClientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim()
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).trim()
  return req.socket?.remoteAddress || req.ip || '0.0.0.0'
}

export function normalizeRegisterIp(ip) {
  const raw = String(ip || '').trim()
  if (!raw) return null
  const v = raw.replace(/^::ffff:/i, '')
  return v.length <= 45 ? v : v.slice(0, 45)
}
