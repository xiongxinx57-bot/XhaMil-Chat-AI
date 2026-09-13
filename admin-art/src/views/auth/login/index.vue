<!-- XhaMil 管理登录（对接 Node /api/admin，极验流程对齐 React 后台） -->
<template>
  <div class="flex w-full h-screen">
    <LoginLeftView />

    <div class="relative flex-1">
      <AuthTopBar />

      <div class="auth-right-wrap">
        <div class="form">
          <h3 class="title">{{ loginTitle }}</h3>
          <p class="sub-title">{{ loginSubtitle }}</p>
          <ElForm
            ref="formRef"
            :model="formData"
            :rules="rules"
            style="margin-top: 25px"
            @submit.prevent
          >
            <ElFormItem prop="username">
              <ElInput
                class="custom-height"
                placeholder="管理员账号"
                v-model.trim="formData.username"
              />
            </ElFormItem>
            <ElFormItem prop="password">
              <ElInput
                class="custom-height"
                placeholder="密码"
                v-model.trim="formData.password"
                type="password"
                autocomplete="off"
                show-password
                @keyup.enter="handleSubmit"
              />
            </ElFormItem>

            <p v-if="verifyHint" class="mb-3 text-xs text-gray-500">{{ verifyHint }}</p>

            <div style="margin-top: 24px">
              <ElButton
                class="w-full custom-height"
                type="primary"
                :loading="loading"
                :disabled="geetestOpen"
                v-ripple
                @click="handleSubmit"
              >
                登录
              </ElButton>
            </div>

          </ElForm>
        </div>
      </div>
    </div>

    <!-- 极验遮罩：z-index 勿过高，避免盖住极验 bind 弹层（对齐 React） -->
    <Teleport to="body">
      <div
        v-if="geetestOpen"
        class="gt-mask"
        role="dialog"
        aria-modal="true"
        @click.self="!loading && closeGeetest()"
      >
        <button
          v-if="!loading"
          type="button"
          class="gt-close"
          aria-label="关闭"
          @click="closeGeetest"
        >
          ×
        </button>
        <div class="gt-panel" @click.stop>
          <p v-if="geetestErr" class="gt-err">{{ geetestErr }}</p>
          <p v-if="geetestBusy" class="gt-busy">验证加载中…</p>
          <div v-if="loading" class="gt-busy">正在登录…</div>
          <div ref="geetestHostRef" class="gt-host"></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { ElMessage, ElNotification, type FormInstance, type FormRules } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'
  import { HttpError } from '@/utils/http/error'
  import {
    fetchLogin,
    fetchPublicVerificationConfig,
    type GeetestValidatePayload
  } from '@/api/auth'
  import { resetRouteInitState } from '@/router/guards/beforeEach'
  import LoginLeftView from '@/components/core/views/login/LoginLeftView.vue'
  import AuthTopBar from '@/components/core/views/login/AuthTopBar.vue'

  defineOptions({ name: 'Login' })

  const loginTitle = computed(() => 'XhaMil 管理后台')
  const loginSubtitle = computed(() => '请使用管理员账号登录')

  const { t } = useI18n()
  const userStore = useUserStore()
  const router = useRouter()
  const route = useRoute()

  const formRef = ref<FormInstance>()
  const loading = ref(false)
  const formData = reactive({
    username: '',
    password: ''
  })

  const rules = computed<FormRules>(() => ({
    username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
  }))

  const verifyHint = ref('')
  const needGeetest = ref(false)
  const captchaId = ref('')
  const geetestOpen = ref(false)
  const geetestBusy = ref(false)
  const geetestErr = ref('')
  const geetestHostRef = ref<HTMLElement | null>(null)
  const geetestInstanceKey = ref(0)
  let geetestObj: any = null
  let geetestLoginLock = false
  let pendingLogin: { username: string; password: string } | null = null

  onMounted(async () => {
    try {
      const cfg = await fetchPublicVerificationConfig()
      needGeetest.value = cfg.geetestEnabled && !!cfg.geetestCaptchaId
      captchaId.value = cfg.geetestCaptchaId
      if (needGeetest.value) verifyHint.value = '已开启极验，登录时将弹出验证'
      else if (cfg.turnstileEnabled)
        verifyHint.value = '已开启 Turnstile（对比版暂跳过，请临时关验证或用极验）'
      else verifyHint.value = '未开启人机验证'
    } catch {
      verifyHint.value = '验证配置加载失败，请确认后端 :5000 已启动'
    }
  })

  onBeforeUnmount(() => {
    destroyGeetest()
  })

  function loadGeetestSdk(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).initGeetest4) {
        resolve()
        return
      }
      const s = document.createElement('script')
      s.src = 'https://static.geetest.com/v4/gt4.js'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('加载极验 SDK 失败，请检查网络'))
      document.head.appendChild(s)
    })
  }

  function destroyGeetest() {
    try {
      geetestObj?.destroy?.()
      geetestObj?.reset?.()
    } catch {
      /* ignore */
    }
    geetestObj = null
    if (geetestHostRef.value) geetestHostRef.value.innerHTML = ''
  }

  function closeGeetest() {
    if (loading.value) return
    geetestOpen.value = false
    geetestBusy.value = false
    geetestErr.value = ''
    pendingLogin = null
    geetestLoginLock = false
    destroyGeetest()
  }

  function toPayload(raw: Record<string, unknown>): GeetestValidatePayload | null {
    const lot = raw.lot_number != null ? String(raw.lot_number) : ''
    const out = raw.captcha_output != null ? String(raw.captcha_output) : ''
    const pass = raw.pass_token != null ? String(raw.pass_token) : ''
    const gen = raw.gen_time != null ? String(raw.gen_time) : ''
    if (!lot || !out || !pass || !gen) return null
    return { lot_number: lot, captcha_output: out, pass_token: pass, gen_time: gen }
  }

  async function openGeetest() {
    geetestErr.value = ''
    geetestBusy.value = true
    geetestOpen.value = true
    geetestInstanceKey.value += 1
    const key = geetestInstanceKey.value
    await nextTick()
    destroyGeetest()

    try {
      await loadGeetestSdk()
      if (key !== geetestInstanceKey.value) return
      if (!(window as any).initGeetest4) {
        throw new Error('极验 SDK 未就绪')
      }

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (fn: () => void) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          fn()
        }
        const timer = setTimeout(() => {
          finish(() => reject(new Error('验证初始化超时，请关闭后重试')))
        }, 15000)

        const protocol = window.location.protocol === 'https:' ? 'https://' : 'http://'
        ;(window as any).initGeetest4(
          { captchaId: captchaId.value, product: 'bind', protocol },
          (captcha: any) => {
            if (key !== geetestInstanceKey.value) return
            geetestObj = captcha
            captcha
              .onReady(() => {
                try {
                  if (typeof captcha.showCaptcha === 'function') captcha.showCaptcha()
                  else if (typeof captcha.showBox === 'function') captcha.showBox()
                  else throw new Error('安全验证不可用')
                  finish(resolve)
                } catch (e) {
                  finish(() => reject(e instanceof Error ? e : new Error('安全验证不可用')))
                }
              })
              .onSuccess(async () => {
                if (geetestLoginLock) return
                const raw = captcha.getValidate()
                if (!raw || typeof raw !== 'object') {
                  geetestErr.value = '验证失败，请重试'
                  return
                }
                const payload = toPayload(raw as Record<string, unknown>)
                if (!payload) {
                  geetestErr.value = '验证结果无效，请重试'
                  return
                }
                geetestLoginLock = true
                try {
                  const ok = await doLogin(payload)
                  if (ok) {
                    geetestOpen.value = false
                    pendingLogin = null
                    destroyGeetest()
                    return
                  }
                  // 登录失败：重新拉起极验
                  destroyGeetest()
                  await nextTick()
                  geetestLoginLock = false
                  await openGeetest()
                } finally {
                  geetestLoginLock = false
                }
              })
              .onError(() => {
                finish(() => reject(new Error('验证加载失败，请关闭后重试')))
              })
              .onClose(() => {
                if (!geetestLoginLock) closeGeetest()
              })
          }
        )
      })
    } catch (e) {
      geetestErr.value = e instanceof Error ? e.message : '初始化失败'
      ElMessage.error(geetestErr.value)
    } finally {
      geetestBusy.value = false
    }
  }

  async function doLogin(geetest: GeetestValidatePayload | null): Promise<boolean> {
    loading.value = true
    try {
      const userName = pendingLogin?.username || formData.username
      const password = pendingLogin?.password || formData.password
      const { token, refreshToken } = await fetchLogin({
        userName,
        password,
        geetest
      })
      if (!token) {
        ElMessage.error('登录失败：无 token')
        return false
      }
      localStorage.setItem('admin_display_name', userName)
      localStorage.setItem('admin_token', token)
      resetRouteInitState()
      userStore.setToken(token, refreshToken)
      userStore.setLoginStatus(true)
      ElNotification({
        title: t('login.success.title'),
        type: 'success',
        duration: 2500,
        zIndex: 10000
      })
      const redirect = (route.query.redirect as string) || '/dashboard/console'
      await router.replace(redirect === '/' ? '/dashboard/console' : redirect)
      return true
    } catch (error) {
      const raw =
        error instanceof HttpError
          ? error.message
          : error instanceof Error
            ? error.message
            : '登录失败'
      if (raw) ElMessage.error(raw)
      console.error('[Login]', error)
      return false
    } finally {
      loading.value = false
    }
  }

  const handleSubmit = async () => {
    if (!formRef.value || loading.value || geetestOpen.value) return
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) {
      ElMessage.warning('请填写账号和密码')
      return
    }

    loading.value = true
    try {
      const cfg = await fetchPublicVerificationConfig()
      needGeetest.value = cfg.geetestEnabled && !!cfg.geetestCaptchaId
      captchaId.value = cfg.geetestCaptchaId

      if (cfg.geetestEnabled && !cfg.geetestCaptchaId) {
        ElMessage.error('后台已开启行为验证，但未配置极验 ID')
        return
      }

      if (needGeetest.value) {
        pendingLogin = {
          username: formData.username.trim(),
          password: formData.password
        }
        loading.value = false
        await openGeetest()
        return
      }

      loading.value = false
      await doLogin(null)
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '无法获取验证配置')
      loading.value = false
    }
  }
</script>

<!-- 必须用 plain scoped + css import，经 scss 导入会导致 Tailwind @apply 不编译 -->
<style scoped>
  @import './style.css';
</style>

<style>
  /* 非 scoped：Teleport 到 body；z-index 与 React 一致，勿盖住极验弹层 */
  .gt-mask {
    position: fixed;
    inset: 0;
    z-index: 2000;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .gt-close {
    position: absolute;
    right: 16px;
    top: 16px;
    z-index: 2001;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(255, 255, 255, 0.9);
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
  }
  .gt-close:hover {
    background: rgba(255, 255, 255, 0.15);
  }
  .gt-panel {
    position: relative;
    max-width: 100vw;
  }
  .gt-host {
    min-height: 80px;
    min-width: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .gt-busy {
    margin-bottom: 8px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
    text-align: center;
  }
  .gt-err {
    margin-bottom: 8px;
    color: #fecaca;
    font-size: 13px;
    text-align: center;
  }
</style>
