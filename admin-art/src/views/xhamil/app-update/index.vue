<!-- App 发版 -->
<template>
  <div class="app-update-page">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">App 发版</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">上传新版安装包，写几句更新说明，打开开关即可</p>
      </div>
      <ElButton type="primary" :loading="saving" v-ripple @click="save">保存并发布</ElButton>
    </div>

    <ElRow :gutter="16" v-loading="loading">
      <ElCol :md="14" :xs="24" class="mb-4">
        <div class="art-card p-5 mb-4">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-base font-medium m-0 mb-1">1. 上传安装包</h3>
              <p class="text-sm text-g-500 mt-0 mb-0">拖入或选择 .apk，版本号会自动识别，不用手填</p>
            </div>
            <ElButton
              v-if="releases.length"
              type="danger"
              plain
              :loading="clearing"
              @click="clearAllApks"
            >
              清空全部
            </ElButton>
          </div>

          <div v-if="form.apkFilename" class="apk-current mb-4">
            <div class="apk-current__badge">当前安装包</div>
            <div class="apk-current__version">v{{ form.versionName || '—' }}</div>
            <div class="apk-current__file">{{ form.apkFilename }}</div>
          </div>

          <ElUpload
            drag
            accept=".apk,application/vnd.android.package-archive"
            :show-file-list="false"
            :auto-upload="false"
            :disabled="uploading"
            @change="onPickApk"
          >
            <div class="py-8">
              <p class="text-base text-g-700 m-0 mb-1">点击或拖拽 APK 到这里</p>
              <p class="text-sm text-g-400 m-0">最大 512MB</p>
            </div>
          </ElUpload>

          <ElTable v-if="releases.length > 1" :data="releases" size="small" class="mt-4">
            <ElTableColumn prop="filename" label="历史安装包" min-width="180" />
            <ElTableColumn label="大小" width="90">
              <template #default="{ row }">{{ formatSize(row.size) }}</template>
            </ElTableColumn>
            <ElTableColumn label="" width="120">
              <template #default="{ row }">
                <ElButton
                  link
                  type="primary"
                  :disabled="row.filename === form.apkFilename"
                  @click="selectApk(row.filename)"
                >
                  {{ row.filename === form.apkFilename ? '使用中' : '换这个' }}
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </div>

        <div class="art-card p-5 mb-4">
          <h3 class="text-base font-medium m-0 mb-1">2. 更新说明</h3>
          <p class="text-sm text-g-500 mt-0 mb-4">用户会在弹窗里看到这段话</p>
          <ElInput
            v-model="form.content"
            type="textarea"
            :rows="5"
            :maxlength="maxLength"
            show-word-limit
            placeholder="例如：修复了聊天闪退，优化了语音房体验…"
          />
        </div>

        <div class="art-card p-5">
          <h3 class="text-base font-medium m-0 mb-4">3. 发布设置</h3>
          <ElForm label-position="left" label-width="140px">
            <ElFormItem label="开启更新提示">
              <ElSwitch v-model="form.enabled" />
            </ElFormItem>
            <ElFormItem label="必须更新">
              <ElSwitch v-model="form.forceUpdate" :disabled="!form.enabled" />
              <span class="text-xs text-g-400 ml-2">开启后用户不能点「稍后再说」</span>
            </ElFormItem>
          </ElForm>

          <ElCollapse class="mt-2">
            <ElCollapseItem title="其他弹窗（通知 / 维护，不发安装包）" name="more">
              <ElForm label-position="top">
                <ElFormItem label="类型">
                  <ElRadioGroup v-model="form.dialogType">
                    <ElRadio value="update">发新版（默认）</ElRadio>
                    <ElRadio value="notice">系统通知</ElRadio>
                    <ElRadio value="maintenance">维护公告</ElRadio>
                  </ElRadioGroup>
                </ElFormItem>
                <ElFormItem label="弹窗标题">
                  <ElInput v-model="form.title" placeholder="发现新版本" />
                </ElFormItem>
                <ElRow :gutter="12">
                  <ElCol :span="12">
                    <ElFormItem label="确认按钮">
                      <ElInput v-model="form.confirmText" />
                    </ElFormItem>
                  </ElCol>
                  <ElCol :span="12">
                    <ElFormItem label="取消按钮">
                      <ElInput v-model="form.cancelText" />
                    </ElFormItem>
                  </ElCol>
                </ElRow>
              </ElForm>
            </ElCollapseItem>
          </ElCollapse>
        </div>
      </ElCol>

      <ElCol :md="10" :xs="24" class="mb-4">
        <div class="art-card p-5 sticky-preview">
          <h3 class="text-base font-medium m-0 mb-4">手机上的效果</h3>
          <div class="preview-dialog">
            <div class="preview-title">{{ previewTitle }}</div>
            <div v-if="form.dialogType === 'update' && form.versionName" class="preview-version">
              版本 {{ form.versionName }}
            </div>
            <div class="preview-body">{{ previewContent || '（写点更新说明吧）' }}</div>
            <div class="preview-actions">
              <span v-if="!form.forceUpdate" class="preview-btn ghost">
                {{ form.cancelText || '稍后再说' }}
              </span>
              <span class="preview-btn primary">{{ form.confirmText || '立即更新' }}</span>
            </div>
          </div>
          <p class="text-xs text-g-500 mt-3 mb-0">
            {{ form.enabled ? '✅ 已开启，用户打开 App 会看到' : '⏸ 未开启' }}
            <template v-if="form.apkFilename && form.dialogType === 'update'">
              · 安装包 v{{ form.versionName }}
            </template>
          </p>
        </div>
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import type { UploadFile } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'

  defineOptions({ name: 'XhamilAppUpdate' })

  const loading = ref(false)
  const saving = ref(false)
  const uploading = ref(false)
  const clearing = ref(false)
  const maxLength = ref(2000)
  const releases = ref<any[]>([])

  const form = reactive({
    enabled: false,
    dialogType: 'update',
    latestVersionCode: 0,
    versionName: '',
    apkFilename: '',
    forceUpdate: false,
    title: '发现新版本',
    content: '',
    confirmText: '立即更新',
    cancelText: '稍后再说'
  })

  const previewTitle = computed(() => {
    if (form.dialogType === 'notice') return form.title.trim() || '系统通知'
    if (form.dialogType === 'maintenance') return form.title.trim() || '维护公告'
    const base = form.title.trim() || '发现新版本'
    if (form.versionName && !base.includes(form.versionName)) {
      return `${base} v${form.versionName}`
    }
    return base
  })

  const previewContent = computed(() => form.content.trim())

  function formatSize(bytes: number) {
    if (!bytes) return '0 B'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  function fillForm(res: any) {
    form.enabled = !!res?.enabled
    form.dialogType = res?.dialogType || 'update'
    form.latestVersionCode = Number(res?.latestVersionCode) || 0
    form.versionName = res?.versionName || ''
    form.apkFilename = res?.apkFilename || ''
    form.forceUpdate = !!res?.forceUpdate
    form.title = res?.title || '发现新版本'
    form.content = res?.content || ''
    form.confirmText = res?.confirmText || '立即更新'
    form.cancelText = res?.cancelText || '稍后再说'
    maxLength.value = Number(res?.contentMaxLength) || 2000
    releases.value = res?.releases?.list || []
  }

  function applyApkMeta(res: any) {
    if (res?.filename) form.apkFilename = res.filename
    if (res?.versionName) form.versionName = res.versionName
    if (res?.versionCode) form.latestVersionCode = Number(res.versionCode)
    if (res?.config) fillForm({ ...res.config, releases: { list: releases.value } })
    if (form.dialogType === 'update' && form.versionName) {
      const autoTitle = `发现新版本 v${form.versionName}`
      if (!form.title.trim() || form.title === '发现新版本') {
        form.title = autoTitle
      }
      if (!form.content.trim()) {
        form.content = '新版本已发布，建议立即更新。'
      }
    }
  }

  async function load() {
    loading.value = true
    try {
      const res = await xhamilApi.getAppUpdateConfig()
      fillForm(res)
    } finally {
      loading.value = false
    }
  }

  async function save() {
    if (form.enabled && form.dialogType === 'update' && !form.apkFilename) {
      ElMessage.error('请先上传 APK')
      return
    }
    if (form.enabled && !form.content.trim()) {
      ElMessage.error('写几句更新说明吧')
      return
    }
    saving.value = true
    try {
      const res = await xhamilApi.saveAppUpdateConfig({
        enabled: form.enabled,
        dialogType: form.dialogType,
        apkFilename: form.apkFilename,
        forceUpdate: form.forceUpdate,
        title: form.title.trim(),
        content: form.content.trim(),
        confirmText: form.confirmText.trim(),
        cancelText: form.cancelText.trim()
      })
      fillForm({ ...res, releases: releases.value.length ? { list: releases.value } : undefined })
      ElMessage.success('已保存')
    } finally {
      saving.value = false
    }
  }

  async function selectApk(filename: string) {
    uploading.value = true
    try {
      const res = await xhamilApi.selectAppReleaseApk(filename)
      fillForm({ ...res, releases: { list: releases.value } })
      applyApkMeta({ filename, versionName: res?.versionName, versionCode: res?.latestVersionCode })
    } finally {
      uploading.value = false
    }
  }

  async function onPickApk(upload: UploadFile) {
    const file = upload.raw
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.apk')) {
      ElMessage.error('请选择 APK 文件')
      return
    }
    uploading.value = true
    try {
      const res = await xhamilApi.uploadAppReleaseApk(file)
      if (res?.releases?.list) releases.value = res.releases.list
      applyApkMeta(res)
      ElMessage.success(`已上传 v${form.versionName}`)
    } finally {
      uploading.value = false
    }
  }

  async function clearAllApks() {
    try {
      await ElMessageBox.confirm('确定删除所有已上传的安装包？当前选用也会被清空。', '清空全部', {
        type: 'warning',
        confirmButtonText: '清空',
        cancelButtonText: '取消'
      })
    } catch {
      return
    }
    clearing.value = true
    try {
      const res = await xhamilApi.deleteAllAppReleaseApks()
      releases.value = res?.releases?.list || []
      form.apkFilename = ''
      form.versionName = ''
      form.latestVersionCode = 0
      ElMessage.success(`已清空 ${res?.deleted ?? 0} 个安装包`)
    } finally {
      clearing.value = false
    }
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .apk-current {
    padding: 14px 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
    border: 1px solid #bbf7d0;
  }

  .apk-current__badge {
    font-size: 12px;
    color: #15803d;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .apk-current__version {
    font-size: 22px;
    font-weight: 700;
    color: #14532d;
    line-height: 1.2;
  }

  .apk-current__file {
    margin-top: 6px;
    font-size: 12px;
    color: #64748b;
    word-break: break-all;
  }

  .sticky-preview {
    position: sticky;
    top: 16px;
  }

  .preview-dialog {
    border-radius: 16px;
    background: #fff;
    border: 1px solid var(--el-border-color-lighter);
    padding: 22px 20px 18px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);
  }

  .preview-title {
    font-size: 18px;
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 6px;
  }

  .preview-version {
    font-size: 13px;
    color: #64748b;
    margin-bottom: 10px;
  }

  .preview-body {
    font-size: 15px;
    line-height: 1.6;
    color: rgba(15, 23, 42, 0.78);
    min-height: 64px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .preview-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }

  .preview-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 88px;
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }

  .preview-btn.ghost {
    color: #64748b;
  }

  .preview-btn.primary {
    background: #0f172a;
    color: #fff;
  }
</style>
