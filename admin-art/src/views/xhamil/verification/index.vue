<!-- 注册验证：按内容高度排，按钮紧跟表单 -->
<template>
  <div class="verification-page" v-loading="loading">
    <div class="page-head">
      <div>
        <h2 class="page-title">注册验证</h2>
        <p class="page-desc">开关短信 / 邮箱注册登录入口；隐藏短信后 App 仅邮箱注册登录</p>
      </div>
      <ElButton :loading="loading" v-ripple @click="load">刷新</ElButton>
    </div>

    <div class="art-card block">
      <div class="block-head">
        <h3 class="block-title">App 入口</h3>
        <ElTag :type="statusTagType" size="small" effect="plain">{{ statusText }}</ElTag>
      </div>
      <div class="switch-grid">
        <div class="switch-item">
          <div>
            <div class="switch-name">开放短信入口</div>
            <div class="switch-hint">关闭后不显示手机号，只能邮箱</div>
          </div>
          <ElSwitch
            v-model="sms.smsVerificationEnabled"
            :disabled="!smsConfigured && !sms.smsVerificationEnabled"
          />
        </div>
        <div class="switch-item">
          <div>
            <div class="switch-name">开放邮箱入口</div>
            <div class="switch-hint">需先配齐 SMTP</div>
          </div>
          <ElSwitch
            v-model="smtp.emailVerificationEnabled"
            :disabled="!smtpConfigured && !smtp.emailVerificationEnabled"
          />
        </div>
        <div class="switch-item">
          <div>
            <div class="switch-name">启用极验</div>
            <div class="switch-hint">需先配齐 Captcha</div>
          </div>
          <ElSwitch
            v-model="geetest.geetestEnabled"
            :disabled="!geetestConfigured && !geetest.geetestEnabled"
          />
        </div>
      </div>
      <div class="actions">
        <ElButton type="primary" :loading="savingFlags" v-ripple @click="saveFlags">
          保存入口开关
        </ElButton>
      </div>
    </div>

    <div class="row-2">
      <div class="art-card block">
        <div class="block-head">
          <h3 class="block-title">短信（阿里云）</h3>
          <ElTag :type="smsConfigured ? 'success' : 'info'" size="small" effect="plain">
            {{ smsConfigured ? '已配齐' : '未配齐' }}
          </ElTag>
        </div>
        <ElForm label-position="top" class="form">
          <ElFormItem label="AccessKey ID" required>
            <ElInput v-model="sms.aliyunSmsAccessKeyId" placeholder="阿里云 AccessKey ID" />
          </ElFormItem>
          <ElFormItem label="AccessKey Secret" required>
            <ElInput
              v-model="sms.aliyunSmsAccessKeySecret"
              type="password"
              show-password
              :placeholder="hasSmsSecret ? '已保存，留空不修改' : 'AccessKey Secret'"
            />
          </ElFormItem>
          <div class="cols-2">
            <ElFormItem label="短信签名" required>
              <ElInput v-model="sms.aliyunSmsSignName" placeholder="如：恒创联众" />
            </ElFormItem>
            <ElFormItem label="模板 Code" required>
              <ElInput v-model="sms.aliyunSmsTemplateCode" placeholder="如：100001" />
            </ElFormItem>
          </div>
          <div class="cols-2">
            <ElFormItem label="有效分钟">
              <ElInputNumber
                v-model="sms.aliyunSmsCodeValidMin"
                :min="1"
                :max="30"
                controls-position="right"
                class="w-full"
              />
            </ElFormItem>
            <ElFormItem label="验证码位数">
              <ElInputNumber
                v-model="sms.aliyunSmsCodeLength"
                :min="4"
                :max="8"
                controls-position="right"
                class="w-full"
              />
            </ElFormItem>
          </div>
          <div class="actions">
            <ElButton type="primary" :loading="savingSms" v-ripple @click="saveSms">
              保存短信配置
            </ElButton>
          </div>
        </ElForm>
      </div>

      <div class="art-card block">
        <div class="block-head">
          <h3 class="block-title">极验 GeeTest</h3>
          <ElTag :type="geetestConfigured ? 'success' : 'info'" size="small" effect="plain">
            {{ geetestConfigured ? '已配齐' : '未配齐' }}
          </ElTag>
        </div>
        <ElForm label-position="top" class="form">
          <ElFormItem label="Captcha ID">
            <ElInput v-model="geetest.geetestCaptchaId" placeholder="极验控制台 Captcha ID" />
          </ElFormItem>
          <ElFormItem label="Captcha Key">
            <ElInput
              v-model="geetest.geetestCaptchaKey"
              type="password"
              show-password
              :placeholder="hasCaptchaKey ? '已保存，留空不修改' : 'Captcha Key'"
            />
          </ElFormItem>
          <p class="tip">用于发码 / 注册防刷。Captcha ID 填极验控制台 ID，不要填邮箱。</p>
          <div class="actions">
            <ElButton type="primary" :loading="savingGt" v-ripple @click="saveGeetest">
              保存极验
            </ElButton>
          </div>
        </ElForm>
      </div>
    </div>

    <div class="art-card block">
      <div class="block-head">
        <h3 class="block-title">邮箱 SMTP</h3>
        <ElTag :type="smtpConfigured ? 'success' : 'info'" size="small" effect="plain">
          {{ smtpConfigured ? '已配齐' : '未配齐' }}
        </ElTag>
      </div>
      <ElForm label-position="top" class="form">
        <div class="cols-smtp">
          <ElFormItem label="SMTP Host" required>
            <ElInput v-model="smtp.smtpHost" placeholder="smtp.qq.com" />
          </ElFormItem>
          <ElFormItem label="端口" required>
            <ElInputNumber
              v-model="smtp.smtpPort"
              :min="1"
              :max="65535"
              controls-position="right"
              class="w-full"
            />
          </ElFormItem>
          <ElFormItem label="账号" required>
            <ElInput v-model="smtp.smtpUser" placeholder="邮箱账号" />
          </ElFormItem>
          <ElFormItem label="发件人名称">
            <ElInput v-model="smtp.smtpFromName" placeholder="可选" />
          </ElFormItem>
          <ElFormItem label="密码 / 授权码">
            <ElInput
              v-model="smtp.smtpPassword"
              type="password"
              show-password
              :placeholder="hasSmtpPassword ? '已保存，留空不修改' : 'SMTP 授权码'"
            />
          </ElFormItem>
          <ElFormItem label="发件人" required>
            <ElInput v-model="smtp.smtpFrom" placeholder="发件邮箱" />
          </ElFormItem>
          <ElFormItem label="邮件标题" required>
            <ElInput v-model="smtp.smtpMailTitle" placeholder="注册验证码" maxlength="64" />
          </ElFormItem>
          <ElFormItem label="测试收件">
            <ElInput v-model="smtpTestTo" placeholder="测试邮件目标邮箱" />
          </ElFormItem>
        </div>
        <ElFormItem label="邮件正文">
          <ElInput
            v-model="smtp.smtpMailBody"
            type="textarea"
            :rows="3"
            placeholder="{{code}} 验证码，{{min}} 分钟"
          />
        </ElFormItem>
        <div class="actions">
          <ElButton type="primary" :loading="savingSmtp" v-ripple @click="saveSmtp">
            保存 SMTP
          </ElButton>
          <ElButton :loading="testing" :disabled="!canTestSend" @click="testSmtp">测试发送</ElButton>
          <ElButton @click="openTemplates">邮件样式</ElButton>
        </div>
      </ElForm>
    </div>

    <ElDialog
      v-model="tplOpen"
      title="验证码邮件样式"
      width="760px"
      destroy-on-close
      align-center
    >
      <div v-loading="tplLoading" class="tpl-grid">
        <button
          v-for="tpl in templates"
          :key="tpl.id"
          type="button"
          class="tpl-card"
          :class="{ active: draftTemplate === tpl.id }"
          @click="draftTemplate = tpl.id"
        >
          <div class="tpl-preview">
            <iframe :srcdoc="tpl.previewHtml" sandbox="" title="preview" />
          </div>
          <div class="tpl-meta">
            <div class="text-sm font-medium">{{ tpl.name }}</div>
            <div class="text-xs text-g-500 mt-0.5">{{ tpl.description }}</div>
          </div>
        </button>
      </div>
      <template #footer>
        <ElButton @click="tplOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="savingTpl" @click="applyTemplate">应用</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'

  defineOptions({ name: 'XhamilVerification' })

  type MailTemplate = {
    id: string
    name: string
    description: string
    previewHtml: string
  }

  const loading = ref(false)
  const savingSmtp = ref(false)
  const savingSms = ref(false)
  const savingFlags = ref(false)
  const savingGt = ref(false)
  const testing = ref(false)
  const tplOpen = ref(false)
  const tplLoading = ref(false)
  const savingTpl = ref(false)
  const smtpTestTo = ref('')
  const hasSmtpPassword = ref(false)
  const hasSmsSecret = ref(false)
  const hasCaptchaKey = ref(false)
  const smtpConfigured = ref(false)
  const smsConfigured = ref(false)
  const smsEffective = ref(false)
  const geetestConfigured = ref(false)
  const templates = ref<MailTemplate[]>([])
  const draftTemplate = ref('classic')

  const smtp = reactive({
    emailVerificationEnabled: false,
    smtpHost: '',
    smtpPort: 465,
    smtpUser: '',
    smtpPassword: '',
    smtpFrom: '',
    smtpFromName: '',
    smtpMailTitle: '注册验证码',
    smtpMailBody: '',
    smtpMailTemplate: 'classic',
    smtpMailLogo: '/media/Official Images/XhaMilAI.jpg'
  })

  const sms = reactive({
    smsVerificationEnabled: false,
    aliyunSmsAccessKeyId: '',
    aliyunSmsAccessKeySecret: '',
    aliyunSmsSignName: '',
    aliyunSmsTemplateCode: '',
    aliyunSmsCodeValidMin: 5,
    aliyunSmsCodeLength: 6
  })

  const geetest = reactive({
    geetestEnabled: false,
    geetestCaptchaId: '',
    geetestCaptchaKey: ''
  })

  const canTestSend = computed(() => {
    const to = smtpTestTo.value.trim()
    return !!to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)
  })

  const statusText = computed(() => {
    if (smsEffective.value && smtp.emailVerificationEnabled) return '短信 + 邮箱'
    if (!smsEffective.value && smtp.emailVerificationEnabled) return '仅邮箱'
    if (smsEffective.value && !smtp.emailVerificationEnabled) return '仅短信'
    return '入口均未开放'
  })

  const statusTagType = computed(() => {
    if (smsEffective.value || smtp.emailVerificationEnabled) return 'success'
    return 'danger'
  })

  function smtpPayload(includePassword = true) {
    const body: Record<string, unknown> = {
      emailVerificationEnabled: smtp.emailVerificationEnabled,
      smtpHost: smtp.smtpHost,
      smtpPort: smtp.smtpPort,
      smtpUser: smtp.smtpUser,
      smtpFrom: smtp.smtpFrom,
      smtpFromName: smtp.smtpFromName,
      smtpMailTitle: smtp.smtpMailTitle,
      smtpMailBody: smtp.smtpMailBody,
      smtpMailTemplate: smtp.smtpMailTemplate,
      smtpMailLogo: smtp.smtpMailLogo
    }
    if (includePassword && smtp.smtpPassword) body.smtpPassword = smtp.smtpPassword
    return body
  }

  function smsPayload(includeSecret = true) {
    const body: Record<string, unknown> = {
      smsVerificationEnabled: sms.smsVerificationEnabled,
      aliyunSmsAccessKeyId: sms.aliyunSmsAccessKeyId,
      aliyunSmsSignName: sms.aliyunSmsSignName,
      aliyunSmsTemplateCode: sms.aliyunSmsTemplateCode,
      aliyunSmsCodeValidMin: sms.aliyunSmsCodeValidMin,
      aliyunSmsCodeLength: sms.aliyunSmsCodeLength
    }
    if (includeSecret && sms.aliyunSmsAccessKeySecret) {
      body.aliyunSmsAccessKeySecret = sms.aliyunSmsAccessKeySecret
    }
    return body
  }

  async function load() {
    loading.value = true
    try {
      const [emailCfg, gtCfg, smsCfg] = await Promise.all([
        xhamilApi.getEmailSmtpConfig(),
        xhamilApi.getGeetestConfig(),
        xhamilApi.getSmsAliyunConfig()
      ])
      hasSmtpPassword.value = !!emailCfg?.hasSmtpPassword
      smtpConfigured.value = !!emailCfg?.isConfigured
      Object.assign(smtp, {
        emailVerificationEnabled: !!emailCfg?.emailVerificationEnabled,
        smtpHost: emailCfg?.smtpHost || '',
        smtpPort: Number(emailCfg?.smtpPort) || 465,
        smtpUser: emailCfg?.smtpUser || '',
        smtpPassword: '',
        smtpFrom: emailCfg?.smtpFrom || '',
        smtpFromName: emailCfg?.smtpFromName || '',
        smtpMailTitle: emailCfg?.smtpMailTitle || '注册验证码',
        smtpMailBody: emailCfg?.smtpMailBody || '',
        smtpMailTemplate: emailCfg?.smtpMailTemplate || 'classic',
        smtpMailLogo: emailCfg?.smtpMailLogo || '/media/Official Images/XhaMilAI.jpg'
      })
      hasCaptchaKey.value = !!gtCfg?.hasCaptchaKey
      geetestConfigured.value = !!gtCfg?.isConfigured
      Object.assign(geetest, {
        geetestEnabled: !!gtCfg?.geetestEnabled,
        geetestCaptchaId: gtCfg?.captchaId || gtCfg?.geetestCaptchaId || '',
        geetestCaptchaKey: ''
      })
      hasSmsSecret.value = !!smsCfg?.hasAccessKeySecret
      smsConfigured.value = !!smsCfg?.isConfigured
      smsEffective.value = !!smsCfg?.smsEffective
      Object.assign(sms, {
        smsVerificationEnabled: !!smsCfg?.smsVerificationEnabled,
        aliyunSmsAccessKeyId: smsCfg?.aliyunSmsAccessKeyId || '',
        aliyunSmsAccessKeySecret: '',
        aliyunSmsSignName: smsCfg?.aliyunSmsSignName || '',
        aliyunSmsTemplateCode: smsCfg?.aliyunSmsTemplateCode || '',
        aliyunSmsCodeValidMin: Number(smsCfg?.aliyunSmsCodeValidMin) || 5,
        aliyunSmsCodeLength: Number(smsCfg?.aliyunSmsCodeLength) || 6
      })
    } finally {
      loading.value = false
    }
  }

  async function saveFlags() {
    if (sms.smsVerificationEnabled && !smsConfigured.value) {
      ElMessage.warning('请先保存完整短信配置，再开放短信入口')
      return
    }
    savingFlags.value = true
    try {
      await xhamilApi.saveVerificationConfig({
        smsVerificationEnabled: sms.smsVerificationEnabled,
        emailVerificationEnabled: smtp.emailVerificationEnabled,
        geetestEnabled: geetest.geetestEnabled
      })
      await xhamilApi.saveEmailSmtpConfig({
        emailVerificationEnabled: smtp.emailVerificationEnabled
      })
      const captchaId = String(geetest.geetestCaptchaId || '').trim()
      if (captchaId && !captchaId.includes('@')) {
        await xhamilApi.saveGeetestConfig({
          geetestEnabled: geetest.geetestEnabled,
          captchaId
        })
      }
      ElMessage.success(
        sms.smsVerificationEnabled ? '入口已保存' : '已隐藏短信入口，App 仅邮箱注册登录'
      )
      await load()
    } finally {
      savingFlags.value = false
    }
  }

  async function saveSms() {
    if (!String(sms.aliyunSmsAccessKeyId || '').trim()) {
      ElMessage.warning('请填写 AccessKey ID')
      return
    }
    if (!String(sms.aliyunSmsSignName || '').trim()) {
      ElMessage.warning('请填写短信签名')
      return
    }
    if (!String(sms.aliyunSmsTemplateCode || '').trim()) {
      ElMessage.warning('请填写模板 Code')
      return
    }
    if (!hasSmsSecret.value && !String(sms.aliyunSmsAccessKeySecret || '').trim()) {
      ElMessage.warning('请填写 AccessKey Secret')
      return
    }
    savingSms.value = true
    try {
      await xhamilApi.saveSmsAliyunConfig(smsPayload())
      await load()
    } finally {
      savingSms.value = false
    }
  }

  async function saveSmtp() {
    if (!String(smtp.smtpMailTitle || '').trim()) {
      ElMessage.warning('请填写邮件标题')
      return
    }
    savingSmtp.value = true
    try {
      await xhamilApi.saveEmailSmtpConfig(smtpPayload())
      await load()
    } finally {
      savingSmtp.value = false
    }
  }

  async function testSmtp() {
    if (!canTestSend.value) {
      ElMessage.warning('请填写合法的测试收件邮箱')
      return
    }
    testing.value = true
    try {
      await xhamilApi.testEmailSmtp({
        to: smtpTestTo.value.trim(),
        ...smtpPayload()
      })
    } finally {
      testing.value = false
    }
  }

  async function saveGeetest() {
    const id = String(geetest.geetestCaptchaId || '').trim()
    if (id.includes('@')) {
      ElMessage.warning('Captcha ID 不能填写邮箱地址')
      return
    }
    savingGt.value = true
    try {
      const body: Record<string, unknown> = {
        geetestEnabled: geetest.geetestEnabled,
        captchaId: id
      }
      if (geetest.geetestCaptchaKey) body.captchaKey = geetest.geetestCaptchaKey
      await xhamilApi.saveGeetestConfig(body)
      ElMessage.success('极验已保存')
      await load()
    } finally {
      savingGt.value = false
    }
  }

  async function openTemplates() {
    draftTemplate.value = smtp.smtpMailTemplate || 'classic'
    tplOpen.value = true
    tplLoading.value = true
    try {
      templates.value =
        (await xhamilApi.getEmailMailTemplates({
          logo: smtp.smtpMailLogo,
          brand: smtp.smtpFromName || 'XhaMil'
        })) || []
    } finally {
      tplLoading.value = false
    }
  }

  async function applyTemplate() {
    if (!draftTemplate.value) return
    savingTpl.value = true
    try {
      smtp.smtpMailTemplate = draftTemplate.value
      await xhamilApi.saveEmailSmtpConfig({
        smtpMailTemplate: smtp.smtpMailTemplate,
        smtpMailLogo: smtp.smtpMailLogo
      })
      tplOpen.value = false
      ElMessage.success('邮件样式已应用')
      await load()
    } finally {
      savingTpl.value = false
    }
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .verification-page {
    width: 100%;
  }

  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .page-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .page-desc {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .block {
    padding: 18px 20px;
    margin-bottom: 16px;
  }

  .block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .block-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .switch-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .switch-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
  }

  .switch-name {
    font-size: 14px;
    font-weight: 500;
  }

  .switch-hint {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .row-2 {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 16px;
    align-items: start;
    margin-bottom: 0;
  }

  .row-2 > .block {
    margin-bottom: 16px;
  }

  .form {
    :deep(.el-form-item) {
      margin-bottom: 12px;
    }
  }

  .cols-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .cols-smtp {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .tip {
    margin: 0 0 12px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--el-fill-color-light);
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
  }

  .w-full {
    width: 100%;
  }

  @media (max-width: 1100px) {
    .row-2,
    .switch-grid,
    .cols-smtp {
      grid-template-columns: 1fr;
    }
  }

  .tpl-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    max-height: 60vh;
    overflow: auto;
  }

  .tpl-card {
    text-align: left;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
    background: var(--el-bg-color);
    padding: 0;
    overflow: hidden;
    cursor: pointer;

    &.active {
      border-color: var(--el-color-primary);
      box-shadow: 0 0 0 1px var(--el-color-primary);
    }
  }

  .tpl-preview {
    height: 160px;
    background: #f5f7fa;
    overflow: hidden;

    iframe {
      width: 200%;
      height: 200%;
      border: 0;
      transform: scale(0.5);
      transform-origin: 0 0;
      pointer-events: none;
    }
  }

  .tpl-meta {
    padding: 10px 12px;
  }
</style>
