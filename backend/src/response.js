export function ok(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data })
}

export const AUTH_BANNED_CODE = 4031

export function fail(res, status, message, code = status) {
  return res.status(status).json({ code, message, data: null })
}

export function failBanned(res, message = '账户已被封禁') {
  return res.status(403).json({ code: AUTH_BANNED_CODE, message, data: { banned: true } })
}
