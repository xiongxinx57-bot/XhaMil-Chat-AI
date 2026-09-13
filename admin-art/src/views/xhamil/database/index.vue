<!-- 数据库配置 -->
<template>
  <div class="database-page">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">数据库配置</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">MySQL 业务表检测、创建与结构升级（共 {{ tableTotal }} 张）</p>
      </div>
      <ElSpace wrap>
        <ElButton :loading="loading" v-ripple @click="load">刷新</ElButton>
        <ElButton type="primary" v-ripple @click="openForm">编辑配置</ElButton>
      </ElSpace>
    </div>

    <ElRow :gutter="20" v-loading="loading">
      <ElCol :md="12" :xs="24" class="mb-5">
        <div class="art-card p-5">
          <h3 class="text-base font-medium m-0 mb-4">连接状态</h3>
          <div class="space-y-2 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-g-500">配置</span>
              <ElTag :type="dbState?.isConfigured ? 'success' : 'info'" size="small">
                {{ dbState?.isConfigured ? '已配置' : '未配置' }}
              </ElTag>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-g-500">连接</span>
              <ElTag :type="dbState?.isConnected ? 'success' : 'danger'" size="small">
                {{ dbState?.isConnected ? '已连接' : '未连接' }}
              </ElTag>
            </div>
            <template v-if="dbState?.config">
              <div>
                <span class="text-g-500">主机：</span>{{ dbState.config.host }}:{{ dbState.config.port }}
              </div>
              <div>
                <span class="text-g-500">数据库：</span>{{ dbState.config.database }}
              </div>
              <div>
                <span class="text-g-500">用户：</span>{{ dbState.config.user }}
              </div>
              <div>
                <span class="text-g-500">字符集：</span>{{ dbState.config.charset || 'utf8mb4' }}
              </div>
              <div>
                <span class="text-g-500">密码：</span>{{ dbState.config.password ? '已设置' : '未设置' }}
              </div>
            </template>
          </div>
          <ElSpace class="mt-4" wrap>
            <ElButton type="danger" plain :disabled="!dbState?.isConfigured" @click="removeConfig">
              移除配置
            </ElButton>
          </ElSpace>
        </div>
      </ElCol>

      <ElCol :md="12" :xs="24" class="mb-5">
        <div class="art-card p-5">
          <h3 class="text-base font-medium m-0 mb-4">存储概览</h3>
          <template v-if="storage">
            <div class="space-y-2 text-sm">
              <div>
                <span class="text-g-500">配置文件：</span>{{ storage.configMeta?.file || '—' }}
                <ElTag
                  class="ml-2"
                  size="small"
                  :type="storage.configMeta?.exists ? 'success' : 'info'"
                >
                  {{ storage.configMeta?.exists ? storage.configMeta?.sizeText || '存在' : '不存在' }}
                </ElTag>
              </div>
              <div>
                <span class="text-g-500">业务表：</span>
                {{ storageTableRows.length }} 张
              </div>
            </div>
            <ElTable
              v-if="storageTableRows.length"
              class="mt-3"
              :data="storageTableRows"
              size="small"
              max-height="220"
            >
              <ElTableColumn prop="desc" label="说明" min-width="120" />
              <ElTableColumn prop="table" label="表名" min-width="160" />
              <ElTableColumn prop="count" label="行数" width="80" />
              <ElTableColumn label="状态" width="88">
                <template #default="{ row }">
                  <ElTag :type="row.exists ? 'success' : 'info'" size="small">
                    {{ row.exists ? '已有' : '未建' }}
                  </ElTag>
                </template>
              </ElTableColumn>
            </ElTable>
          </template>
          <p v-else class="text-sm text-g-500 m-0">暂无存储信息</p>
        </div>
      </ElCol>
    </ElRow>

    <div class="art-card p-5 mb-5">
      <div class="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 class="text-base font-medium m-0">配置包迁移（json/）</h3>
          <p class="text-sm text-g-500 mt-1 mb-0">
            操作的是<strong>当前后台所连服务器</strong>上的
            <code>json/config.json</code>、<code>json/changelog.json</code>
            （不是 Cursor 本机打开的那份）。
          </p>
        </div>
        <ElSpace wrap>
          <ElButton :loading="loadingPack" @click="loadPackMeta">刷新文件</ElButton>
          <ElButton type="primary" plain :loading="exporting" @click="exportJson">
            导出配置包
          </ElButton>
          <ElButton type="warning" plain @click="openImport">导入配置包</ElButton>
          <ElButton type="danger" plain @click="clearPackDialogOpen = true">清理全部</ElButton>
        </ElSpace>
      </div>

      <ElAlert
        type="info"
        :closable="false"
        class="mb-3"
        :title="`当前环境：${packEnvHost} · 默认导出脱敏；勾选「包含密钥」才会带上密码/API Key`"
      />

      <ElTable v-if="packFiles.length" :data="packFiles" size="small">
        <ElTableColumn prop="desc" label="说明" min-width="120" />
        <ElTableColumn prop="name" label="文件" min-width="160" />
        <ElTableColumn prop="sizeText" label="大小" width="100" />
        <ElTableColumn label="状态" width="88">
          <template #default="{ row }">
            <ElTag :type="row.exists ? 'success' : 'info'" size="small">
              {{ row.exists ? '存在' : '无' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="mtime" label="修改时间" min-width="170" />
      </ElTable>
      <p v-else class="text-sm text-g-500 m-0 mb-3">暂无文件信息，请点「刷新文件」</p>

      <div class="mt-3">
        <ElCheckbox v-model="exportIncludeSecrets">导出时包含密钥（密码 / API Key）</ElCheckbox>
      </div>
    </div>

    <div class="art-card p-5 mb-5">
      <div class="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 class="text-base font-medium m-0">业务表</h3>
        <ElSpace wrap>
          <ElButton :disabled="!dbState?.isConnected" :loading="checking" @click="() => checkTables()">
            检查业务表
          </ElButton>
          <ElButton :disabled="!dbState?.isConnected" :loading="initing" type="primary" @click="initTables">
            创建/升级表结构
          </ElButton>
          <ElButton
            type="danger"
            :disabled="!dbState?.isConnected"
            @click="clearDialogOpen = true"
          >
            清空全部数据
          </ElButton>
        </ElSpace>
      </div>

      <ElAlert
        v-if="checkResult"
        class="mb-3"
        :type="checkResult.missingCount ? 'warning' : 'success'"
        :closable="false"
        :title="`共 ${checkResult.total} 张表 · 已有 ${checkResult.presentCount} · 缺失 ${checkResult.missingCount}`"
      />

      <ElTable v-if="businessTableRows.length" :data="businessTableRows" size="small" max-height="480">
        <ElTableColumn prop="desc" label="说明" min-width="140" />
        <ElTableColumn prop="name" label="表名" min-width="200" />
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag
              :type="row.exists === false ? 'danger' : row.exists ? 'success' : 'info'"
              size="small"
            >
              {{
                row.exists === false ? '缺失' : row.exists ? '已存在' : '未知'
              }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="count" label="行数" width="90" />
      </ElTable>
      <p v-else class="text-sm text-g-500 m-0">
        {{ dbState?.isConnected ? '暂无业务表信息' : '请先连接数据库' }}
      </p>
    </div>

    <ElDialog v-model="formOpen" title="数据库连接配置" width="480px" destroy-on-close align-center>
      <ElForm label-position="top">
        <ElFormItem label="主机">
          <ElInput v-model="form.host" placeholder="127.0.0.1" />
        </ElFormItem>
        <ElFormItem label="端口">
          <ElInputNumber v-model="form.port" :min="1" :max="65535" class="w-full!" />
        </ElFormItem>
        <ElFormItem label="用户名">
          <ElInput v-model="form.user" />
        </ElFormItem>
        <ElFormItem label="密码">
          <ElInput
            v-model="form.password"
            type="password"
            show-password
            placeholder="留空则不修改已保存密码"
          />
        </ElFormItem>
        <ElFormItem label="数据库">
          <ElInput v-model="form.database" />
        </ElFormItem>
        <ElFormItem label="字符集">
          <ElInput v-model="form.charset" placeholder="utf8mb4" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton :loading="testing" @click="testConnection">测试连接</ElButton>
        <ElButton @click="formOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="saveConfig">保存</ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="clearDialogOpen"
      title="清空全部数据"
      width="420px"
      destroy-on-close
      align-center
    >
      <ElAlert
        type="error"
        :closable="false"
        class="mb-4"
        title="将清空当前库所有表数据（保留表结构），不可恢复。"
      />
      <p class="text-sm mb-2">
        请输入确认语：
        <span class="font-medium" style="color: var(--el-color-danger)">{{ CLEAR_CONFIRM }}</span>
      </p>
      <ElInput v-model="clearConfirm" :placeholder="CLEAR_CONFIRM" autocomplete="off" />
      <template #footer>
        <ElButton @click="clearDialogOpen = false">取消</ElButton>
        <ElButton type="danger" :loading="clearing" @click="clearAllData">确定清空</ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="clearPackDialogOpen"
      title="清理全部配置"
      width="460px"
      destroy-on-close
      align-center
      @closed="clearPackConfirm = ''"
    >
      <ElAlert
        type="error"
        :closable="false"
        class="mb-4"
        title="将把 config.json 恢复为默认配置，并清空 changelog.json。后台入口码会保留；数据库连接需重新配置。"
      />
      <p class="text-sm mb-2">
        请输入确认语：
        <span class="font-medium" style="color: var(--el-color-danger)">{{ CLEAR_PACK_CONFIRM }}</span>
      </p>
      <ElInput v-model="clearPackConfirm" :placeholder="CLEAR_PACK_CONFIRM" autocomplete="off" />
      <template #footer>
        <ElButton @click="clearPackDialogOpen = false">取消</ElButton>
        <ElButton type="danger" :loading="clearingPack" @click="clearAllPack">确定清理</ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="importDialogOpen"
      title="导入配置包"
      width="520px"
      destroy-on-close
      align-center
      @closed="resetImport"
    >
      <ElForm label-position="top">
        <ElFormItem label="配置包 JSON">
          <input
            ref="importFileRef"
            type="file"
            accept="application/json,.json"
            class="block w-full text-sm"
            @change="onPickImportFile"
          />
          <p v-if="importFileName" class="text-sm text-g-500 mt-2 mb-0">已选：{{ importFileName }}</p>
        </ElFormItem>
        <ElFormItem label="导入模式">
          <ElRadioGroup v-model="importMode">
            <ElRadioButton value="replace">覆盖写入</ElRadioButton>
            <ElRadioButton value="merge">合并写入</ElRadioButton>
          </ElRadioGroup>
        </ElFormItem>
        <ElAlert
          v-if="importMode === 'replace'"
          type="warning"
          :closable="false"
          class="mb-3"
          title="覆盖模式会直接替换包内的 config.json / changelog.json。"
        />
        <ElFormItem v-if="importMode === 'replace'" label="确认语">
          <ElInput v-model="importConfirm" :placeholder="IMPORT_REPLACE_CONFIRM" autocomplete="off" />
          <p class="text-xs text-g-500 mt-1 mb-0">
            请输入：
            <span class="font-medium" style="color: var(--el-color-danger)">{{
              IMPORT_REPLACE_CONFIRM
            }}</span>
          </p>
        </ElFormItem>
        <ElFormItem v-if="importPreview" label="文件摘要">
          <div class="text-sm text-g-700 space-y-1">
            <div>导出时间：{{ importPreview.exportedAt || '—' }}</div>
            <div>包含文件：{{ importPreview.fileNames }}</div>
            <div>含密钥：{{ importPreview.includeSecrets ? '是' : '否（已脱敏）' }}</div>
          </div>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="importDialogOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="importing" :disabled="!importPayload" @click="doImport">
          开始导入
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'
  import { TABLE_LABELS, tableLabel } from '@/utils/dbTableLabels'

  defineOptions({ name: 'XhamilDatabase' })

  const CLEAR_CONFIRM = '我已确认删除数据库所有内容'
  const IMPORT_REPLACE_CONFIRM = '我已确认导入并覆盖配置'
  const CLEAR_PACK_CONFIRM = '我已确认清理全部配置'

  const loading = ref(false)
  const loadingPack = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const checking = ref(false)
  const initing = ref(false)
  const clearing = ref(false)
  const clearingPack = ref(false)
  const exporting = ref(false)
  const importing = ref(false)
  const formOpen = ref(false)
  const clearDialogOpen = ref(false)
  const clearConfirm = ref('')
  const clearPackDialogOpen = ref(false)
  const clearPackConfirm = ref('')
  const importDialogOpen = ref(false)
  const importMode = ref<'replace' | 'merge'>('replace')
  const importConfirm = ref('')
  const importFileName = ref('')
  const importPayload = ref<any>(null)
  const importFileObj = ref<File | null>(null)
  const importFileRef = ref<HTMLInputElement | null>(null)
  const exportIncludeSecrets = ref(false)
  const packFiles = ref<
    Array<{ name: string; desc: string; exists: boolean; sizeText: string; mtime?: string }>
  >([])
  const packEnvHost = computed(() => {
    if (typeof window === 'undefined') return '—'
    return window.location.host || window.location.origin
  })

  const importPreview = computed(() => {
    const data = importPayload.value
    if (!data?.files || typeof data.files !== 'object') return null
    return {
      exportedAt: data.exportedAt,
      fileNames: Object.keys(data.files).join('、') || '—',
      includeSecrets: !!data.includeSecrets
    }
  })

  const dbState = ref<any>(null)
  const storage = ref<any>(null)
  const checkResult = ref<any>(null)

  const form = reactive({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'xhamil_chat',
    charset: 'utf8mb4'
  })

  const tableTotal = computed(() => Object.keys(TABLE_LABELS).length)

  const storageTableRows = computed(() => {
    const raw = (storage.value?.tables || storage.value?.collections || []) as Array<{
      table?: string
      key?: string
      desc?: string
      count?: number
      exists?: boolean
    }>
    return raw.map((row) => ({
      table: row.table || row.key || '',
      desc: row.desc || tableLabel(row.table || row.key || ''),
      count: row.count ?? '—',
      exists: !!row.exists
    }))
  })

  const businessTableRows = computed(() => {
    const collections = storageTableRows.value
    const byKey = new Map(collections.map((c) => [c.table, c]))
    const present = new Set((checkResult.value?.present || []) as string[])
    const missing = new Set((checkResult.value?.missing || []) as string[])
    const names = [
      ...new Set([
        ...Object.keys(TABLE_LABELS),
        ...collections.map((c) => c.table),
        ...((checkResult.value?.present || []) as string[]),
        ...((checkResult.value?.missing || []) as string[])
      ])
    ]
    return names.map((name) => {
      const row = byKey.get(name)
      let exists: boolean | null = null
      if (present.has(name)) exists = true
      else if (missing.has(name)) exists = false
      else if (typeof row?.exists === 'boolean') exists = row.exists
      return {
        name,
        desc: tableLabel(name, row?.desc),
        count: row?.count ?? '—',
        exists
      }
    })
  })

  async function loadPackMeta() {
    loadingPack.value = true
    try {
      const res = await xhamilApi.getJsonPackMeta()
      packFiles.value = res?.files || []
    } catch {
      packFiles.value = []
    } finally {
      loadingPack.value = false
    }
  }

  async function load() {
    loading.value = true
    try {
      const [cfg, info] = await Promise.all([
        xhamilApi.getDatabaseConfig(),
        xhamilApi.getStorageInfo().catch(() => null),
        loadPackMeta()
      ])
      dbState.value = cfg
      storage.value = info
      if (cfg?.isConnected) {
        await checkTables({ silent: true })
      } else {
        checkResult.value = null
      }
    } finally {
      loading.value = false
    }
  }

  function openForm() {
    const c = dbState.value?.config
    Object.assign(
      form,
      c
        ? {
            host: c.host || '127.0.0.1',
            port: Number(c.port) || 3306,
            user: c.user || 'root',
            password: '',
            database: c.database || 'xhamil_chat',
            charset: c.charset || 'utf8mb4'
          }
        : {
            host: '127.0.0.1',
            port: 3306,
            user: 'root',
            password: '',
            database: 'xhamil_chat',
            charset: 'utf8mb4'
          }
    )
    formOpen.value = true
  }

  function buildPayload() {
    const payload: Record<string, unknown> = {
      host: form.host,
      port: form.port || 3306,
      user: form.user,
      database: form.database,
      charset: form.charset || 'utf8mb4'
    }
    if (form.password?.trim()) payload.password = form.password
    return payload
  }

  async function testConnection() {
    if (!form.host || !form.user || !form.database) {
      ElMessage.warning('请先填写主机、用户名和数据库名')
      return
    }
    testing.value = true
    try {
      await xhamilApi.testDatabaseConnection(buildPayload())
      ElMessage.success('连接测试成功')
    } finally {
      testing.value = false
    }
  }

  async function saveConfig() {
    saving.value = true
    try {
      const res = await xhamilApi.setDatabaseConfig(buildPayload())
      ElMessage.success(res?.message || '已保存')
      formOpen.value = false
      await load()
    } finally {
      saving.value = false
    }
  }

  async function removeConfig() {
    await ElMessageBox.confirm('确定移除数据库配置？', '确认', { type: 'warning' })
    await xhamilApi.removeDatabaseConfig()
    ElMessage.success('已移除')
    checkResult.value = null
    await load()
  }

  async function checkTables(opts: { silent?: boolean } = {}) {
    checking.value = true
    try {
      checkResult.value = await xhamilApi.checkDatabaseTables()
      if (!opts.silent) ElMessage.success('检测完成')
      // 刷新行数
      storage.value = (await xhamilApi.getStorageInfo().catch(() => storage.value)) || storage.value
    } finally {
      checking.value = false
    }
  }

  async function initTables() {
    initing.value = true
    try {
      const res = await xhamilApi.initDatabaseTables()
      ElMessage.success(res?.message || '表结构已升级')
      await load()
    } finally {
      initing.value = false
    }
  }

  async function clearAllData() {
    const text = clearConfirm.value.trim()
    if (text !== CLEAR_CONFIRM) {
      ElMessage.warning('确认语不正确')
      return
    }
    clearing.value = true
    try {
      const res = await xhamilApi.clearAllDatabaseData(text)
      ElMessage.success(res?.message || '已清空')
      clearDialogOpen.value = false
      clearConfirm.value = ''
      await load()
    } finally {
      clearing.value = false
    }
  }

  function downloadJsonFile(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportJson() {
    exporting.value = true
    try {
      const res = await xhamilApi.exportDatabaseJson({
        includeSecrets: exportIncludeSecrets.value
      })
      const files = res?.files
      if (!files || typeof files !== 'object' || !files['config.json']) {
        ElMessage.error('导出失败：结果中没有 config.json，请强刷后台后再试')
        return
      }
      const filename =
        res?.filename ||
        `xhamil-json-pack-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
      const payload = {
        format: res.format || 'xhamil-json-pack',
        version: res.version || 1,
        exportedAt: res.exportedAt,
        includeSecrets: !!res.includeSecrets,
        fileOrder: res.fileOrder || Object.keys(files),
        fileMeta: res.fileMeta,
        files
      }
      downloadJsonFile(payload, filename)
      ElMessage.success(
        `已下载：${Object.keys(files).join('、')}${exportIncludeSecrets.value ? '（含密钥）' : '（已脱敏）'}`
      )
    } catch (e: any) {
      ElMessage.error(e?.message || '导出失败')
    } finally {
      exporting.value = false
    }
  }

  async function clearAllPack() {
    const text = clearPackConfirm.value.trim()
    if (text !== CLEAR_PACK_CONFIRM) {
      ElMessage.warning('确认语不正确')
      return
    }
    clearingPack.value = true
    try {
      const res = await xhamilApi.clearJsonPack(text)
      ElMessage.success(res?.message || '已清理')
      clearPackDialogOpen.value = false
      clearPackConfirm.value = ''
      await load()
    } finally {
      clearingPack.value = false
    }
  }

  function openImport() {
    resetImport()
    importDialogOpen.value = true
  }

  function resetImport() {
    importMode.value = 'replace'
    importConfirm.value = ''
    importFileName.value = ''
    importPayload.value = null
    importFileObj.value = null
    if (importFileRef.value) importFileRef.value.value = ''
  }

  async function onPickImportFile(ev: Event) {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) {
      importPayload.value = null
      importFileObj.value = null
      importFileName.value = ''
      return
    }
    importFileName.value = file.name
    importFileObj.value = file
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data || data.format !== 'xhamil-json-pack' || !data.files) {
        throw new Error('不是有效的 XhaMil 配置包（需 format=xhamil-json-pack）')
      }
      importPayload.value = data
    } catch (e: any) {
      importPayload.value = null
      importFileObj.value = null
      ElMessage.error(e?.message || 'JSON 解析失败')
      if (importFileRef.value) importFileRef.value.value = ''
      importFileName.value = ''
    }
  }

  async function doImport() {
    if (!importPayload.value || !importFileObj.value) {
      ElMessage.warning('请先选择配置包文件')
      return
    }
    if (importMode.value === 'replace') {
      if (importConfirm.value.trim() !== IMPORT_REPLACE_CONFIRM) {
        ElMessage.warning('确认语不正确')
        return
      }
      await ElMessageBox.confirm(
        '覆盖导入将替换本机 json/ 下对应配置文件，确定继续？',
        '确认导入',
        { type: 'warning' }
      )
    }
    importing.value = true
    try {
      const res = await xhamilApi.importDatabaseJson({
        file: importFileObj.value,
        mode: importMode.value,
        confirmText: importMode.value === 'replace' ? importConfirm.value.trim() : undefined
      })
      ElMessage.success(res?.message || '导入完成')
      importDialogOpen.value = false
      await load()
    } finally {
      importing.value = false
    }
  }

  onMounted(load)
</script>
