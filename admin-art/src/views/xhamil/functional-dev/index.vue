<!-- 功能性开发配置 -->
<template>
  <div class="functional-dev-page" v-loading="loading">
    <ElForm label-position="top" size="small" @submit.prevent>
      <div class="card-row">
        <!-- 帮助与客服 -->
        <div class="dev-card">
          <div class="dev-card-title">帮助与客服</div>
          <div class="dev-card-body">
            <ElFormItem label="弹窗标题">
              <ElInput v-model="form.helpSupport.title" maxlength="64" placeholder="帮助与客服">
                <template #prefix>
                  <ArtSvgIcon icon="ri:customer-service-2-line" />
                </template>
              </ElInput>
            </ElFormItem>
            <ElFormItem label="弹窗说明">
              <ElInput
                v-model="form.helpSupport.content"
                type="textarea"
                :rows="2"
                maxlength="300"
                placeholder="联系客服说明…"
              />
            </ElFormItem>
            <ElFormItem label="QQ 号">
              <ElInput v-model="form.helpSupport.qq" maxlength="32" placeholder="123456789">
                <template #prefix>
                  <ArtSvgIcon icon="ri:qq-line" />
                </template>
              </ElInput>
            </ElFormItem>
            <ElFormItem label="微信号" class="!mb-0">
              <ElInput v-model="form.helpSupport.wechat" maxlength="32" placeholder="xhamil_support">
                <template #prefix>
                  <ArtSvgIcon icon="ri:wechat-line" />
                </template>
              </ElInput>
            </ElFormItem>
          </div>
        </div>

        <!-- 入群门禁 -->
        <div class="dev-card">
          <div class="dev-card-title">入群门禁</div>
          <div class="dev-card-body">
            <ElFormItem label="启用">
              <ElSwitch v-model="form.gateGroup.enabled" />
            </ElFormItem>
            <ElFormItem label="门禁群号">
              <ElInput
                v-model="form.gateGroup.groupCode"
                :disabled="!form.gateGroup.enabled"
                placeholder="仅数字群号"
                maxlength="20"
                @input="onGroupCodeInput"
              >
                <template #prefix>
                  <ArtSvgIcon icon="ri:group-line" />
                </template>
              </ElInput>
            </ElFormItem>
            <ElFormItem label="弹窗标题">
              <ElInput
                v-model="form.gateGroup.title"
                :disabled="!form.gateGroup.enabled"
                maxlength="64"
                placeholder="欢迎加入"
              >
                <template #prefix>
                  <ArtSvgIcon icon="ri:door-open-line" />
                </template>
              </ElInput>
            </ElFormItem>
            <ElFormItem label="弹窗内容">
              <ElInput
                v-model="form.gateGroup.content"
                type="textarea"
                :rows="2"
                :disabled="!form.gateGroup.enabled"
                maxlength="500"
                placeholder="进群说明…"
              />
            </ElFormItem>
            <div class="grid grid-cols-2 gap-2">
              <ElFormItem label="确认" class="!mb-0">
                <ElInput
                  v-model="form.gateGroup.confirmText"
                  :disabled="!form.gateGroup.enabled"
                  maxlength="16"
                  placeholder="进入"
                />
              </ElFormItem>
              <ElFormItem label="取消" class="!mb-0">
                <ElInput
                  v-model="form.gateGroup.cancelText"
                  :disabled="!form.gateGroup.enabled"
                  maxlength="16"
                  placeholder="退出"
                />
              </ElFormItem>
            </div>
          </div>
        </div>

        <!-- 私聊通话 -->
        <div class="dev-card">
          <div class="dev-card-title">私聊通话</div>
          <div class="dev-card-body">
            <ElFormItem label="关闭私聊语音/视频通话" class="!mb-0">
              <ElSwitch v-model="form.privateCall.disabled" />
              <div class="field-extra">开启后，用户无法在私聊中发起或接听语音、视频通话</div>
            </ElFormItem>
            <div class="call-hint mt-4">
              <ArtSvgIcon icon="ri:phone-off-line" class="shrink-0 mt-0.5" />
              <span>仅影响一对一私聊；群聊多人语音不受影响。</span>
            </div>
          </div>
        </div>

        <!-- 发送位置（高德） -->
        <div class="dev-card">
          <div class="dev-card-title">
            发送位置
            <ElTag
              class="ml-2"
              size="small"
              effect="plain"
              :type="amap.configured ? 'success' : 'info'"
            >
              {{ amap.configured ? '已配置 Key' : '未配置' }}
            </ElTag>
          </div>
          <div class="dev-card-body">
            <ElFormItem label="启用位置服务">
              <ElSwitch v-model="amap.enabled" />
              <div class="field-extra">
                关闭或未配置 Key 时，客户端「+」面板不显示「发送位置」（便于售出源码后无 Key 也不露入口）
              </div>
            </ElFormItem>
            <ElFormItem label="高德 Web 服务 Key">
              <ElInput
                v-model="amap.webApiKey"
                type="password"
                show-password
                :placeholder="amap.hasKey ? '已保存，留空不修改' : 'restapi.amap.com 使用的 Key'"
              />
            </ElFormItem>
            <div class="call-hint">
              <ArtSvgIcon icon="ri:map-pin-line" class="shrink-0 mt-0.5" />
              <span>
                必须配置 Web Key 才会显示定位入口。Key 只在服务器；Android 地图 SDK Key
                仍在 App 打包配置（包名/SHA1）。
              </span>
            </div>
            <ElButton
              class="mt-4"
              type="primary"
              :loading="savingAmap"
              v-ripple
              @click="saveAmap"
            >
              保存位置服务
            </ElButton>
          </div>
        </div>

        <!-- 关于页（手机端） -->
        <div class="dev-card dev-card--wide">
          <div class="dev-card-title">关于页（手机端）</div>
          <div class="dev-card-body">
            <div class="about-grid">
              <ElFormItem label="标语">
                <ElInput v-model="form.aboutPage.tagline" maxlength="64" placeholder="用心做好每一次聊天" />
              </ElFormItem>
              <ElFormItem label="致谢标题">
                <ElInput v-model="form.aboutPage.creditsTitle" maxlength="32" placeholder="致谢" />
              </ElFormItem>
              <ElFormItem label="特别鸣谢标题">
                <ElInput v-model="form.aboutPage.thanksTitle" maxlength="32" placeholder="特别鸣谢" />
              </ElFormItem>
              <ElFormItem label="特别鸣谢说明">
                <ElInput
                  v-model="form.aboutPage.thanksHint"
                  maxlength="80"
                  placeholder="开发狂魔 + 测试运营双人组"
                />
              </ElFormItem>
              <ElFormItem label="底部版权" class="about-span-2">
                <ElInput v-model="form.aboutPage.copyright" maxlength="80" placeholder="© XhaMil · xhaoy" />
              </ElFormItem>
            </div>

            <div class="dev-block">
              <div class="dev-block-title">开发者卡片</div>
              <div class="dev-block-row">
                <div class="avatar-uploader">
                  <div class="avatar-preview" :style="{ background: '#e8eef6' }">
                    <img
                      v-if="form.aboutPage.developerAvatarUrl"
                      :src="previewUrl(form.aboutPage.developerAvatarUrl)"
                      alt="开发者头像"
                    />
                    <span v-else class="avatar-placeholder">上传</span>
                  </div>
                  <div class="avatar-actions">
                    <ElUpload
                      :show-file-list="false"
                      accept="image/*"
                      :http-request="(opt) => onUploadAvatar(opt, 'developer')"
                      :disabled="uploadingAvatar"
                    >
                      <ElButton size="small" type="primary" plain :loading="uploadingAvatar">
                        上传头像
                      </ElButton>
                    </ElUpload>
                    <ElButton
                      v-if="form.aboutPage.developerAvatarUrl"
                      size="small"
                      plain
                      @click="form.aboutPage.developerAvatarUrl = ''"
                    >
                      清除
                    </ElButton>
                  </div>
                  <div class="field-extra">留空则用 App 内置图</div>
                </div>
                <div class="dev-fields">
                  <ElFormItem label="名字">
                    <ElInput v-model="form.aboutPage.developerName" maxlength="32" placeholder="xhaoy" />
                  </ElFormItem>
                  <ElFormItem label="角色">
                    <ElInput
                      v-model="form.aboutPage.developerRole"
                      maxlength="64"
                      placeholder="全栈开发 · 独自扛下所有"
                    />
                  </ElFormItem>
                  <ElFormItem label="徽章" class="!mb-0">
                    <ElInput v-model="form.aboutPage.developerBadge" maxlength="16" placeholder="Dev" />
                  </ElFormItem>
                </div>
              </div>
            </div>

            <div class="thanks-head">
              <span>特别鸣谢列表</span>
              <ElButton size="small" type="primary" plain @click="addThanks">添加</ElButton>
            </div>
            <div class="thanks-list">
              <div v-for="(item, idx) in form.aboutPage.thanks" :key="idx" class="thanks-row">
                <div class="thanks-avatar">
                  <div
                    class="avatar-preview avatar-preview--sm"
                    :style="{ background: item.tint || '#2F6FED' }"
                  >
                    <img
                      v-if="item.avatarUrl"
                      :src="previewUrl(item.avatarUrl)"
                      :alt="item.name || '头像'"
                    />
                    <span v-else class="avatar-placeholder">{{ (item.name || '?').slice(0, 1) }}</span>
                  </div>
                  <ElUpload
                    :show-file-list="false"
                    accept="image/*"
                    :http-request="(opt) => onUploadAvatar(opt, 'thanks', idx)"
                    :disabled="uploadingAvatar"
                  >
                    <ElButton size="small" plain :loading="uploadingAvatar">上传</ElButton>
                  </ElUpload>
                  <ElButton
                    v-if="item.avatarUrl"
                    size="small"
                    plain
                    @click="item.avatarUrl = ''"
                  >
                    清除
                  </ElButton>
                </div>
                <ElInput v-model="item.name" maxlength="32" placeholder="名字" />
                <ElInput v-model="item.role" maxlength="48" placeholder="角色" />
                <div class="tint-field">
                  <input v-model="item.tint" type="color" class="tint-picker" title="主题色" />
                  <ElInput v-model="item.tint" maxlength="9" placeholder="#2F6FED" />
                </div>
                <ElButton type="danger" plain @click="removeThanks(idx)">删</ElButton>
              </div>
              <div v-if="!form.aboutPage.thanks.length" class="field-extra">暂无条目，可点「添加」</div>
            </div>
            <div class="field-extra mt-2">
              头像存到 media/About Page（与用户头像分离）。上传后请点「保存全部」写入关于页。更新日志仍在「版本更新」里配置。
            </div>
          </div>
        </div>
      </div>

      <ElSpace class="mt-5">
        <ElButton :loading="loading" v-ripple @click="load">重置</ElButton>
        <ElButton type="primary" :loading="saving" v-ripple @click="save">保存全部</ElButton>
      </ElSpace>
    </ElForm>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import type { UploadRequestOptions } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'
  import { mediaUrl } from '@/utils/xhamilMedia'

  defineOptions({ name: 'XhamilFunctionalDev' })

  const loading = ref(false)
  const saving = ref(false)
  const savingAmap = ref(false)
  const uploadingAvatar = ref(false)

  const amap = reactive({
    enabled: true,
    webApiKey: '',
    hasKey: false,
    configured: false
  })

  function defaultForm() {
    return {
      gateGroup: {
        enabled: false,
        groupCode: '',
        title: '欢迎加入聊天室',
        content:
          '本功能适用于开发者交流或校园聊天室场景。确认后将直接进入指定群聊，无需额外申请。',
        confirmText: '进入',
        cancelText: '退出'
      },
      helpSupport: {
        title: '帮助与客服',
        content: '如有问题请联系客服。',
        qq: '',
        wechat: ''
      },
      aboutPage: {
        tagline: '用心做好每一次聊天',
        creditsTitle: '致谢',
        developerName: 'xhaoy',
        developerRole: '全栈开发 · 独自扛下所有',
        developerBadge: 'Dev',
        developerAvatarUrl: '',
        thanksTitle: '特别鸣谢',
        thanksHint: '开发狂魔 + 测试运营双人组',
        copyright: '© XhaMil · xhaoy',
        thanks: [
          { name: 'xhaoy', role: '前端开发', tint: '#2F6FED', avatarUrl: '' },
          { name: 'xhaoy', role: '后端优化', tint: '#10B981', avatarUrl: '' },
          { name: 'xhaoy', role: '产品设计', tint: '#8B5CF6', avatarUrl: '' },
          { name: 'xhaoy', role: '交互动效', tint: '#F97316', avatarUrl: '' },
          { name: 'xhaoy', role: '音视频架构', tint: '#EA4335', avatarUrl: '' },
          { name: 'xhaoy', role: '安全与性能', tint: '#06B6D4', avatarUrl: '' },
          { name: 'xhaoy', role: '运维部署', tint: '#EC4899', avatarUrl: '' },
          { name: 'xhaoy', role: '深夜修 Bug', tint: '#64748B', avatarUrl: '' },
          { name: 'fuyelk', role: '测试运营', tint: '#0EA5E9', avatarUrl: '' },
          { name: 'DOYWB🤔', role: '测试运营', tint: '#A855F7', avatarUrl: '' }
        ]
      },
      privateCall: {
        disabled: false
      }
    }
  }

  const form = reactive(defaultForm())

  function sanitizeDigits(v: string) {
    return String(v || '').replace(/\D/g, '')
  }

  function onGroupCodeInput(val: string) {
    form.gateGroup.groupCode = sanitizeDigits(val)
  }

  function normalizeThanksList(list: any): Array<{
    name: string
    role: string
    tint: string
    avatarUrl: string
  }> {
    const base = defaultForm().aboutPage.thanks
    if (!Array.isArray(list) || !list.length) return base.map((x) => ({ ...x }))
    return list.map((item) => ({
      name: String(item?.name || '').trim(),
      role: String(item?.role || '').trim(),
      tint: String(item?.tint || '#2F6FED').trim() || '#2F6FED',
      avatarUrl: String(item?.avatarUrl || '').trim()
    }))
  }

  function addThanks() {
    form.aboutPage.thanks.push({
      name: '',
      role: '',
      tint: '#2F6FED',
      avatarUrl: ''
    })
  }

  function removeThanks(idx: number) {
    form.aboutPage.thanks.splice(idx, 1)
  }

  function previewUrl(path: string) {
    return mediaUrl(path)
  }

  async function onUploadAvatar(
    opt: UploadRequestOptions,
    target: 'developer' | 'thanks',
    thanksIndex = -1
  ) {
    uploadingAvatar.value = true
    try {
      const res = await xhamilApi.uploadAboutPageAvatar(opt.file as File)
      const url = String(res?.avatarUrl || '').trim()
      if (!url) throw new Error('上传成功但未返回地址')
      if (target === 'developer') {
        form.aboutPage.developerAvatarUrl = url
      } else if (thanksIndex >= 0 && form.aboutPage.thanks[thanksIndex]) {
        form.aboutPage.thanks[thanksIndex].avatarUrl = url
      }
      opt.onSuccess?.({} as any)
    } catch (e: any) {
      opt.onError?.(e)
      ElMessage.error(e?.message || '上传失败')
    } finally {
      uploadingAvatar.value = false
    }
  }

  function applyRes(res: any) {
    const base = defaultForm()
    Object.assign(form, {
      gateGroup: {
        enabled: !!res?.gateGroup?.enabled,
        groupCode: sanitizeDigits(res?.gateGroup?.groupCode || ''),
        title: res?.gateGroup?.title || base.gateGroup.title,
        content: res?.gateGroup?.content || base.gateGroup.content,
        confirmText: res?.gateGroup?.confirmText || '进入',
        cancelText: res?.gateGroup?.cancelText || '退出'
      },
      helpSupport: {
        title: res?.helpSupport?.title || '帮助与客服',
        content: res?.helpSupport?.content || '',
        qq: res?.helpSupport?.qq || '',
        wechat: res?.helpSupport?.wechat || ''
      },
      aboutPage: {
        tagline: res?.aboutPage?.tagline || base.aboutPage.tagline,
        creditsTitle: res?.aboutPage?.creditsTitle || base.aboutPage.creditsTitle,
        developerName: res?.aboutPage?.developerName || base.aboutPage.developerName,
        developerRole: res?.aboutPage?.developerRole || base.aboutPage.developerRole,
        developerBadge: res?.aboutPage?.developerBadge || base.aboutPage.developerBadge,
        developerAvatarUrl: res?.aboutPage?.developerAvatarUrl || '',
        thanksTitle: res?.aboutPage?.thanksTitle || base.aboutPage.thanksTitle,
        thanksHint:
          res?.aboutPage?.thanksHint !== undefined && res?.aboutPage?.thanksHint !== null
            ? String(res.aboutPage.thanksHint)
            : base.aboutPage.thanksHint,
        copyright: res?.aboutPage?.copyright || base.aboutPage.copyright,
        thanks: normalizeThanksList(res?.aboutPage?.thanks)
      },
      privateCall: {
        disabled: !!res?.privateCall?.disabled
      }
    })
  }

  function validate(): string | null {
    const required: [string, string][] = [
      [form.helpSupport.title, '请填写客服弹窗标题'],
      [form.gateGroup.title, '请填写门禁弹窗标题'],
      [form.gateGroup.content, '请填写门禁弹窗内容'],
      [form.gateGroup.confirmText, '请填写门禁确认文案'],
      [form.gateGroup.cancelText, '请填写门禁取消文案'],
      [form.aboutPage.tagline, '请填写关于页标语'],
      [form.aboutPage.creditsTitle, '请填写致谢标题'],
      [form.aboutPage.developerName, '请填写开发者名字'],
      [form.aboutPage.developerRole, '请填写开发者角色'],
      [form.aboutPage.developerBadge, '请填写徽章文案'],
      [form.aboutPage.thanksTitle, '请填写特别鸣谢标题'],
      [form.aboutPage.copyright, '请填写底部版权']
    ]
    for (const [val, msg] of required) {
      if (!String(val || '').trim()) return msg
    }
    if (form.gateGroup.enabled && !form.gateGroup.groupCode) {
      return '启用门禁时请填写群号'
    }
    for (let i = 0; i < form.aboutPage.thanks.length; i++) {
      const item = form.aboutPage.thanks[i]
      if (!String(item.name || '').trim()) return `特别鸣谢第 ${i + 1} 项请填写名字`
      if (!String(item.role || '').trim()) return `特别鸣谢第 ${i + 1} 项请填写角色`
    }
    return null
  }

  async function loadAmap() {
    try {
      const res = await xhamilApi.getAmapConfig()
      amap.enabled = res?.amapEnabled !== false && res?.enabled !== false
      amap.hasKey = !!res?.hasWebApiKey
      amap.configured = !!res?.configured
      amap.webApiKey = ''
    } catch {
      /* ignore */
    }
  }

  async function saveAmap() {
    savingAmap.value = true
    try {
      const body: Record<string, unknown> = {
        amapEnabled: !!amap.enabled
      }
      if (String(amap.webApiKey || '').trim()) {
        body.amapWebApiKey = String(amap.webApiKey).trim()
      }
      const res = await xhamilApi.saveAmapConfig(body)
      amap.enabled = res?.amapEnabled !== false && res?.enabled !== false
      amap.hasKey = !!res?.hasWebApiKey
      amap.configured = !!res?.configured
      amap.webApiKey = ''
      ElMessage.success('位置服务配置已保存')
    } finally {
      savingAmap.value = false
    }
  }

  async function load() {
    loading.value = true
    try {
      applyRes(await xhamilApi.getFrontendConfig())
      await loadAmap()
    } finally {
      loading.value = false
    }
  }

  async function save() {
    const err = validate()
    if (err) {
      ElMessage.warning(err)
      return
    }
    saving.value = true
    try {
      const payload = {
        gateGroup: {
          ...form.gateGroup,
          groupCode: sanitizeDigits(form.gateGroup.groupCode)
        },
        helpSupport: { ...form.helpSupport },
        aboutPage: {
          ...form.aboutPage,
          thanks: form.aboutPage.thanks.map((item) => ({ ...item }))
        },
        privateCall: { ...form.privateCall }
      }
      const res = await xhamilApi.setFrontendConfig(payload)
      applyRes(res)
      ElMessage.success('配置已保存')
    } finally {
      saving.value = false
    }
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .card-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .dev-card {
    width: 300px;
    height: 480px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    overflow: hidden;
  }

  .dev-card--wide {
    width: 100%;
    height: auto;
    min-height: 420px;
  }

  .about-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 12px;
  }

  .about-span-2 {
    grid-column: 1 / -1;
  }

  .dev-block {
    margin: 8px 0 16px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-fill-color-blank);
  }

  .dev-block-title {
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .dev-block-row {
    display: flex;
    gap: 20px;
    align-items: flex-start;
  }

  .avatar-uploader {
    width: 120px;
    flex-shrink: 0;
  }

  .avatar-preview {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid var(--el-border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  .avatar-preview--sm {
    width: 48px;
    height: 48px;
    margin-bottom: 0;
  }

  .avatar-placeholder {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.92);
    font-weight: 600;
  }

  .avatar-uploader .avatar-placeholder {
    color: var(--el-text-color-secondary);
  }

  .avatar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 4px;
  }

  .dev-fields {
    flex: 1;
    min-width: 0;
  }

  .thanks-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 8px 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .thanks-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .thanks-row {
    display: grid;
    grid-template-columns: 168px 1fr 1.2fr 120px auto;
    gap: 8px;
    align-items: center;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
  }

  .thanks-avatar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tint-field {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tint-picker {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    flex-shrink: 0;
  }

  .dev-card-title {
    flex-shrink: 0;
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    border-bottom: 1px solid var(--el-border-color-lighter);
    background: var(--el-fill-color-blank);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  .dev-card-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 16px;
  }

  .dev-card-body :deep(.el-form-item) {
    margin-bottom: 12px;
  }

  .dev-card-body :deep(.el-form-item__label) {
    margin-bottom: 4px !important;
    line-height: 1.3;
  }

  .field-extra {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--el-text-color-secondary);
  }

  .call-hint {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
    line-height: 1.6;
    color: #888;
  }

  @media (max-width: 900px) {
    .thanks-row {
      grid-template-columns: 1fr 1fr;
    }

    .thanks-avatar {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 640px) {
    .dev-card {
      width: 100%;
      height: auto;
      min-height: 320px;
    }

    .about-grid {
      grid-template-columns: 1fr;
    }

    .dev-block-row {
      flex-direction: column;
    }

    .thanks-row {
      grid-template-columns: 1fr;
    }
  }
</style>
