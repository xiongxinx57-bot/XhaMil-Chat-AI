import { Router } from 'express'
import { loadConfig } from '../config.js'
import { avatarUrlFromFilename, normalizeAvatarPath } from '../avatar.js'
import { isValidEmail, normalizeEmail } from '../email.js'
import {
  consumeRegisterEmailCode,
  sendRegisterEmailCode,
  sendLoginEmailCode,
  verifyRegisterEmailCode
} from '../emailCodes.js'
import {
  sendRegisterSmsCode,
  sendLoginSmsCode,
  verifyRegisterSmsCode,
  verifyLoginSmsCode
} from '../smsCodes.js'
import { isSmsVerificationEnabled, normalizePhone, isValidCnPhone } from '../aliyunSms.js'
import { resolveGeetestEnabled, verifyGeetestFromRequestBody } from '../geetest.js'
import { fail, ok, failBanned } from '../response.js'
import {
  createUser,
  assertRegisterRateLimit,
  findUserById,
  findUserByUsername,
  findUserByUsernameLoose,
  findUserByChatNo,
  findUserByEmail,
  findUserByPhone,
  getUserPublic,
  getUserPublicWithExtras,
  isEmailRegistered,
  isPhoneRegistered,
  loginUser,
  changeUserPassword,
  touchUserClientBrowser,
  updateUserProfile,
  ensureUserProvinceFromIp,
} from '../db.js'
import { createUserSession, requireUser, revokeUserSession, syncUserSessionsByUserId } from '../userAuth.js'
import { assertUserDisplayName } from '../xssGuard.js'
import { uploadUserAvatar } from '../upload.js'
import { getClientIp, normalizeRegisterIp } from '../clientIp.js'
import { assertAllowedRegisterUsername, assertRegisterBurstLimit } from '../registerRateLimit.js'
import {
  cancelQrLogin,
  confirmQrLogin,
  createQrLoginSession,
  getQrLoginStatus,
  markQrLoginScanned,
  parseQrLoginPayload
} from '../qrLogin.js'

const router = Router()

router.get('/ban-status', async (req, res) => {
  try {
    const username = String(req.query.username || '').trim()
    if (!username) return ok(res, { banned: false })
    const user = await findUserByUsernameLoose(username)
    return ok(res, {
      banned: !!(user && user.status === 'banned'),
      username: user?.username || username
    })
  } catch (e) {
    return fail(res, 500, e.message || '查询失败')
  }
})

/** 登录页预览：按账户名/聊聊号返回公开头像（不含敏感信息） */
router.get('/login-preview', async (req, res) => {
  try {
    const account = String(req.query.account || req.query.username || '').trim()
    if (!account) return ok(res, { found: false, avatarUrl: '', nickname: '' })
    let user = await findUserByUsernameLoose(account)
    if (!user && /^\d+$/.test(account)) {
      user = await findUserByChatNo(account)
    }
    if (!user || user.status === 'banned') {
      return ok(res, { found: false, avatarUrl: '', nickname: '' })
    }
    const pub = getUserPublic(user)
    return ok(res, {
      found: true,
      avatarUrl: pub.avatarUrl || '',
      nickname: pub.nickname || pub.username || '',
      username: pub.username || ''
    })
  } catch (e) {
    return fail(res, 500, e.message || '查询失败')
  }
})

router.post('/email/send-code', async (req, res) => {
  try {
    await sendRegisterEmailCode(req)
    return ok(res, null, '验证码已发送到邮箱')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '发送失败')
  }
})

router.post('/email/login-send-code', async (req, res) => {
  try {
    await sendLoginEmailCode(req)
    return ok(res, null, '验证码已发送到邮箱')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '发送失败')
  }
})

router.post('/sms/send-code', async (req, res) => {
  try {
    await sendRegisterSmsCode(req)
    return ok(res, null, '验证码已发送到手机')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '发送失败')
  }
})

router.post('/sms/login-send-code', async (req, res) => {
  try {
    await sendLoginSmsCode(req)
    return ok(res, null, '验证码已发送到手机')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '发送失败')
  }
})

router.post('/register', (req, res) => {
  uploadUserAvatar.single('avatar')(req, res, async (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      assertRegisterBurstLimit(req)

      const config = loadConfig()
      if (resolveGeetestEnabled(config)) {
        const gr = await verifyGeetestFromRequestBody(req.body)
        if (!gr.ok) return fail(res, 400, gr.message || '请先完成行为验证（极验）')
      }

      const rawUsername = String(req.body?.username || req.body?.accountName || '').trim()
      const password = String(req.body?.password || '')
      const emailVerifyOn = config.emailVerificationEnabled === true
      const smsVerifyOn = isSmsVerificationEnabled(config)
      const modeRaw = String(req.body?.registerMode || req.body?.mode || '').trim().toLowerCase()
      const registerMode =
        modeRaw === 'email' || modeRaw === 'sms'
          ? modeRaw
          : smsVerifyOn
            ? 'sms'
            : emailVerifyOn
              ? 'email'
              : 'sms'

      const email = normalizeEmail(req.body?.email)
      const emailCode = String(req.body?.emailCode || req.body?.code || '').trim()
      const phone = normalizePhone(req.body?.phone || req.body?.mobile)
      const smsCode = String(req.body?.smsCode || req.body?.phoneCode || '').trim()

      if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]{3,32}$/.test(rawUsername)) {
        return fail(res, 400, '账户名需 3-32 位，支持中文、字母、数字、下划线')
      }
      const username = rawUsername
      const nickname = username
      assertAllowedRegisterUsername(username)

      if (password.length < 6) {
        return fail(res, 400, '密码至少 6 位')
      }

      let bindEmail = null
      let bindPhone = null

      if (registerMode === 'sms') {
        if (!smsVerifyOn) return fail(res, 403, '短信注册未开启')
        if (!isValidCnPhone(phone)) return fail(res, 400, '请输入有效手机号')
        if (await isPhoneRegistered(phone)) return fail(res, 409, '该手机号已被注册')
        const vr = await verifyRegisterSmsCode(phone, smsCode)
        if (!vr.ok) return fail(res, 400, vr.message || '短信验证码错误')
        if (await isPhoneRegistered(phone)) return fail(res, 409, '该手机号已被注册')
        bindPhone = phone
      } else {
        if (!emailVerifyOn) return fail(res, 403, '邮箱注册未开启')
        if (!isValidEmail(email)) return fail(res, 400, '请输入有效邮箱')
        if (await isEmailRegistered(email)) return fail(res, 409, '该邮箱已被注册')
        const vr = verifyRegisterEmailCode(email, emailCode)
        if (!vr.ok) return fail(res, 400, vr.message)
        if (await isEmailRegistered(email)) return fail(res, 409, '该邮箱已被注册')
        bindEmail = email
      }

      const existing = await findUserByUsername(username)
      if (existing) return fail(res, 409, '账户名已被占用')

      let avatarUrl = ''
      if (req.file) {
        avatarUrl = avatarUrlFromFilename(req.file.filename)
      } else if (req.body?.avatarUrl) {
        const norm = normalizeAvatarPath(req.body.avatarUrl)
        if (!norm.startsWith('/media/avatar/')) {
          return fail(res, 400, '无效的头像地址')
        }
        avatarUrl = norm
      }

      const registerIp = normalizeRegisterIp(getClientIp(req))
      await assertRegisterRateLimit(registerIp)

      const user = await createUser({
        username,
        password,
        nickname,
        avatarUrl,
        email: bindEmail,
        phone: bindPhone,
        registerIp,
        userAgent: req.headers['user-agent']
      })
      if (bindEmail) consumeRegisterEmailCode(email)
      const token = createUserSession(user)
      return ok(res, { token, user: await getUserPublicWithExtras(user) }, '注册成功')
    } catch (e) {
      if (e?.code === 'EMAIL_TAKEN') return fail(res, 409, e.message)
      if (e?.code === 'PHONE_TAKEN') return fail(res, 409, e.message)
      return fail(res, e.status || 500, e.message || '注册失败')
    }
  })
})

router.post('/register/avatar', (req, res) => {
  uploadUserAvatar.single('avatar')(req, res, (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      if (!req.file) return fail(res, 400, '未上传头像文件')
      const avatarUrl = avatarUrlFromFilename(req.file.filename)
      return ok(res, { avatarUrl, avatar: avatarUrl }, '上传成功')
    } catch (e) {
      return fail(res, 500, e.message || '上传失败')
    }
  })
})

router.post('/login', async (req, res) => {
  try {
    const config = loadConfig()
    if (resolveGeetestEnabled(config)) {
      const gr = await verifyGeetestFromRequestBody(req.body)
      if (!gr.ok) return fail(res, 400, gr.message || '请先完成行为验证（极验）')
    }

    const loginId = String(req.body?.username || req.body?.accountName || '').trim()
    const password = String(req.body?.password || '')
    if (!loginId || !password) return fail(res, 400, '请输入账户名和密码')

    let user = await findUserByUsernameLoose(loginId)
    if (!user && /^\d+$/.test(loginId)) {
      user = await findUserByChatNo(loginId)
    }
    if (user && user.status === 'banned') {
      return failBanned(res)
    }

    const loggedIn = await loginUser(loginId, password)
    if (!loggedIn) return fail(res, 401, '账户名或密码错误')

    await touchUserClientBrowser(loggedIn.id, req.headers['user-agent'], {
      clientType: req.headers['x-client-type'],
      deviceModel: req.headers['x-device-model'],
      headers: req.headers,
      clientIp: normalizeRegisterIp(getClientIp(req)),
      forwardedFor: typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for']
        : Array.isArray(req.headers['x-forwarded-for'])
          ? req.headers['x-forwarded-for'].join(', ')
          : '',
      remoteAddress: req.socket?.remoteAddress || ''
    })

    const token = createUserSession(loggedIn)
    return ok(res, { token, user: await getUserPublicWithExtras(loggedIn) }, '登录成功')
  } catch (e) {
    const msg = String(e.message || '')
    if (/极验|geetest|captcha|行为验证/i.test(msg)) {
      return fail(res, 400, msg || '行为验证失败，请重试')
    }
    if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|PROTOCOL_CONNECTION_LOST|MySQL|ER_/i.test(msg)) {
      return fail(res, 503, '数据库连接失败，请检查网络或稍后重试')
    }
    return fail(res, 500, e.message || '登录失败')
  }
})

async function finishCodeLogin(res, req, user) {
  if (!user) return fail(res, 401, '登录失败')
  if (user.status === 'banned') return failBanned(res)
  await touchUserClientBrowser(user.id, req.headers['user-agent'], {
    clientType: req.headers['x-client-type'],
    deviceModel: req.headers['x-device-model'],
    headers: req.headers,
    clientIp: normalizeRegisterIp(getClientIp(req)),
    forwardedFor: typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for']
      : Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'].join(', ')
        : '',
    remoteAddress: req.socket?.remoteAddress || ''
  })
  const token = createUserSession(user)
  return ok(res, { token, user: await getUserPublicWithExtras(user) }, '登录成功')
}

router.post('/login/sms', async (req, res) => {
  try {
    const config = loadConfig()
    if (!isSmsVerificationEnabled(config)) return fail(res, 403, '短信登录未开启')
    if (resolveGeetestEnabled(config)) {
      const gr = await verifyGeetestFromRequestBody(req.body)
      if (!gr.ok) return fail(res, 400, gr.message || '请先完成行为验证（极验）')
    }
    const phone = normalizePhone(req.body?.phone || req.body?.mobile)
    const smsCode = String(req.body?.smsCode || req.body?.code || '').trim()
    if (!isValidCnPhone(phone)) return fail(res, 400, '请输入有效手机号')
    const vr = await verifyLoginSmsCode(phone, smsCode)
    if (!vr.ok) return fail(res, 400, vr.message || '验证码错误')
    const user = await findUserByPhone(phone)
    if (!user) return fail(res, 404, '该手机号未注册')
    return finishCodeLogin(res, req, user)
  } catch (e) {
    return fail(res, e.status || 500, e.message || '登录失败')
  }
})

router.post('/login/email', async (req, res) => {
  try {
    const config = loadConfig()
    if (config.emailVerificationEnabled !== true) return fail(res, 403, '邮箱登录未开启')
    if (resolveGeetestEnabled(config)) {
      const gr = await verifyGeetestFromRequestBody(req.body)
      if (!gr.ok) return fail(res, 400, gr.message || '请先完成行为验证（极验）')
    }
    const email = normalizeEmail(req.body?.email)
    const emailCode = String(req.body?.emailCode || req.body?.code || '').trim()
    if (!isValidEmail(email)) return fail(res, 400, '请输入有效邮箱')
    const vr = verifyRegisterEmailCode(email, emailCode)
    if (!vr.ok) return fail(res, 400, vr.message || '验证码错误')
    const user = await findUserByEmail(email)
    if (!user) return fail(res, 404, '该邮箱未注册')
    consumeRegisterEmailCode(email)
    return finishCodeLogin(res, req, user)
  } catch (e) {
    return fail(res, e.status || 500, e.message || '登录失败')
  }
})

router.get('/me', requireUser, async (req, res) => {
  try {
    const user = await findUserById(req.user.userId)
    if (!user) return fail(res, 401, '用户不存在或已失效')
    await touchUserClientBrowser(req.user.userId, req.headers['user-agent'], {
      clientType: req.headers['x-client-type'],
      deviceModel: req.headers['x-device-model'],
      headers: req.headers,
      clientIp: normalizeRegisterIp(getClientIp(req)),
      forwardedFor: typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for']
        : Array.isArray(req.headers['x-forwarded-for'])
          ? req.headers['x-forwarded-for'].join(', ')
          : '',
      remoteAddress: req.socket?.remoteAddress || ''
    })
    const withRegion = await ensureUserProvinceFromIp(user)
    return ok(res, { user: await getUserPublicWithExtras(withRegion) })
  } catch (e) {
    return fail(res, 500, e.message || '获取用户信息失败')
  }
})

router.patch('/profile', requireUser, async (req, res) => {
  try {
    const body = req.body || {}
    const usernameRaw = body.username ?? body.accountName ?? body.nickname
    const hasUsername = usernameRaw !== undefined && usernameRaw !== null && String(usernameRaw).trim() !== ''
    const hasProvince = Object.prototype.hasOwnProperty.call(body, 'province')
    if (!hasUsername && !hasProvince) return fail(res, 400, '请提供更新内容')

    const payload = {}
    if (hasUsername) payload.username = String(usernameRaw).trim()
    if (hasProvince) payload.province = String(body.province ?? '').trim()

    const user = await updateUserProfile(req.user.userId, payload)
    if (hasUsername) {
      syncUserSessionsByUserId(user.id, {
        username: user.username,
        nickname: user.nickname
      })
    }
    return ok(res, { user: await getUserPublicWithExtras(user) }, '保存成功')
  } catch (e) {
    return fail(res, 400, e.message || '保存失败')
  }
})

router.post('/change-password', requireUser, async (req, res) => {
  try {
    const body = req.body || {}
    const oldPassword = String(body.oldPassword ?? body.currentPassword ?? '')
    const newPassword = String(body.newPassword ?? body.password ?? '')
    const confirmPassword = body.confirmPassword != null
      ? String(body.confirmPassword)
      : null
    if (confirmPassword != null && confirmPassword !== newPassword) {
      return fail(res, 400, '两次新密码不一致')
    }
    await changeUserPassword(req.user.userId, oldPassword, newPassword)
    return ok(res, null, '密码已修改')
  } catch (e) {
    return fail(res, e.status || 400, e.message || '修改密码失败')
  }
})

router.post('/avatar', requireUser, (req, res) => {
  uploadUserAvatar.single('avatar')(req, res, async (err) => {
    if (err) return fail(res, 400, err.message || '上传失败')
    try {
      if (!req.file) return fail(res, 400, '未上传头像文件')
      const avatarUrl = avatarUrlFromFilename(req.file.filename)
      const user = await updateUserProfile(req.user.userId, { avatarUrl })
      return ok(res, { user: await getUserPublicWithExtras(user), avatarUrl, avatar: avatarUrl }, '头像已更新')
    } catch (e) {
      return fail(res, 500, e.message || '上传头像失败')
    }
  })
})

router.post('/logout', requireUser, (req, res) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  revokeUserSession(token)
  return ok(res, null, '已退出')
})

/** 桌面端创建扫码登录会话 */
router.post('/qr/create', async (req, res) => {
  try {
    const deviceName = String(req.body?.deviceName || req.headers['x-device-model'] || 'Windows XhaMil').trim()
    const session = await createQrLoginSession({
      deviceName,
      location: String(req.body?.location || '').trim()
    })
    return ok(res, session)
  } catch (e) {
    return fail(res, 500, e.message || '创建失败')
  }
})

/** 桌面端轮询扫码状态 */
router.get('/qr/status', async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || '').trim()
    if (!sessionId) return fail(res, 400, '缺少 sessionId')
    const status = await getQrLoginStatus(sessionId)
    return ok(res, status)
  } catch (e) {
    return fail(res, 500, e.message || '查询失败')
  }
})

/** App 扫到二维码后标记（需登录） */
router.post('/qr/scan', requireUser, async (req, res) => {
  try {
    let sessionId = String(req.body?.sessionId || '').trim()
    if (!sessionId) sessionId = parseQrLoginPayload(req.body?.payload || req.body?.qr || '') || ''
    if (!sessionId) return fail(res, 400, '无效的登录二维码')
    const userId = Number(req.authUser?.id || req.user?.userId || req.user?.id) || 0
    const userRow = userId ? await findUserById(userId) : null
    if (!userRow) return fail(res, 401, '请先登录')
    const pub = getUserPublic(userRow)
    const data = await markQrLoginScanned(sessionId, userRow, {
      avatarUrl: pub.avatarUrl || '',
      location: String(req.body?.location || userRow.province || '').trim()
    })
    return ok(res, data, '已扫码，请确认登录')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '扫码失败')
  }
})

/** App 确认登录（需登录） */
router.post('/qr/confirm', requireUser, async (req, res) => {
  try {
    let sessionId = String(req.body?.sessionId || '').trim()
    if (!sessionId) sessionId = parseQrLoginPayload(req.body?.payload || '') || ''
    if (!sessionId) return fail(res, 400, '无效的登录二维码')

    const userId = Number(req.authUser?.id || req.user?.userId || req.user?.id) || 0
    const userRow = userId ? await findUserById(userId) : null
    if (!userRow) return fail(res, 401, '请先登录')
    if (userRow.status === 'banned') return failBanned(res)

    // 若尚未 scan，先记扫码人
    try {
      const pub = getUserPublic(userRow)
      await markQrLoginScanned(sessionId, userRow, {
        avatarUrl: pub.avatarUrl || '',
        location: String(req.body?.location || userRow.province || '').trim()
      })
    } catch (e) {
      if (e.status && e.status !== 409) throw e
    }

    await touchUserClientBrowser(userRow.id, req.headers['user-agent'], {
      clientType: req.headers['x-client-type'] || 'desktop-qr',
      deviceModel: req.headers['x-device-model'],
      headers: req.headers,
      clientIp: normalizeRegisterIp(getClientIp(req)),
      forwardedFor: typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for']
        : Array.isArray(req.headers['x-forwarded-for'])
          ? req.headers['x-forwarded-for'].join(', ')
          : '',
      remoteAddress: req.socket?.remoteAddress || ''
    })

    const token = createUserSession(userRow)
    const user = await getUserPublicWithExtras(userRow)
    await confirmQrLogin(sessionId, { token, user })
    return ok(res, { ok: true }, '已确认登录')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '确认失败')
  }
})

/** App 取消扫码登录 */
router.post('/qr/cancel', requireUser, async (req, res) => {
  try {
    let sessionId = String(req.body?.sessionId || '').trim()
    if (!sessionId) sessionId = parseQrLoginPayload(req.body?.payload || '') || ''
    if (!sessionId) return fail(res, 400, '无效的登录二维码')
    const userId = Number(req.authUser?.id || req.user?.userId || req.user?.id) || 0
    await cancelQrLogin(sessionId, userId)
    return ok(res, null, '已取消')
  } catch (e) {
    return fail(res, e.status || 500, e.message || '取消失败')
  }
})

export default router
