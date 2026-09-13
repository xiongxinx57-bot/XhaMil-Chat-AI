import request from '@/utils/http'

export interface GeetestValidatePayload {
  lot_number: string
  captcha_output: string
  pass_token: string
  gen_time: string
}

export interface PublicVerificationConfig {
  geetestEnabled: boolean
  geetestCaptchaId: string
  turnstileEnabled: boolean
  turnstileSiteKey: string
}

/** 登录（对接 Node /api/admin/login） */
export function fetchLogin(params: {
  userName: string
  password: string
  turnstileToken?: string
  geetest?: GeetestValidatePayload | null
}) {
  const body: Record<string, string> = {
    username: params.userName,
    password: params.password
  }
  if (params.turnstileToken) body.turnstileToken = params.turnstileToken
  const g = params.geetest
  if (g?.lot_number && g.captcha_output && g.pass_token && g.gen_time != null) {
    body.lot_number = String(g.lot_number)
    body.captcha_output = String(g.captcha_output)
    body.pass_token = String(g.pass_token)
    body.gen_time = String(g.gen_time)
  }

  return request
    .post<{ token?: string; username?: string }>({
      url: '/api/admin/login',
      params: body,
      showErrorMessage: true
    })
    .then((data) => ({
      token: data?.token || '',
      refreshToken: data?.token || ''
    }))
}

/** 用户信息：校验 session 后返回前端权限角色 */
export async function fetchGetUserInfo() {
  await request.get({
    url: '/api/admin/session',
    showErrorMessage: false
  })
  const name = localStorage.getItem('admin_display_name') || 'admin'
  return {
    buttons: ['*'],
    roles: ['R_SUPER', 'R_ADMIN'],
    userId: 1,
    userName: name,
    email: '',
    avatar: ''
  } as Api.Auth.UserInfo
}

/** 公开验证配置（登录页用，不走鉴权失败弹窗） */
export async function fetchPublicVerificationConfig(): Promise<PublicVerificationConfig> {
  try {
    const data = await request.get<{
      geetestEnabled?: boolean
      geetestCaptchaId?: string
      turnstileEnabled?: boolean
      turnstileSiteKey?: string
    }>({
      url: '/api/admin/verification-config',
      showErrorMessage: false
    })
    return {
      geetestEnabled: !!data?.geetestEnabled,
      geetestCaptchaId: (data?.geetestCaptchaId || '').trim(),
      turnstileEnabled: !!data?.turnstileEnabled,
      turnstileSiteKey: (data?.turnstileSiteKey || '').trim()
    }
  } catch {
    return {
      geetestEnabled: false,
      geetestCaptchaId: '',
      turnstileEnabled: false,
      turnstileSiteKey: ''
    }
  }
}
