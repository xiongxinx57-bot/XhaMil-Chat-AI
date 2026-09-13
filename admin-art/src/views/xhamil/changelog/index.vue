<!-- 更新日志：关于页展示，后台逐条编写 -->
<template>
  <div class="changelog-page">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">更新日志</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">
          写入后在 App「关于」页按版本展示 · 当前 {{ list.length }} 条
        </p>
      </div>
      <ElSpace wrap>
        <ElButton :loading="loading" v-ripple @click="load">刷新</ElButton>
        <ElButton type="primary" v-ripple @click="openCreate">新增一条</ElButton>
      </ElSpace>
    </div>

    <div class="art-card p-5" v-loading="loading">
      <ElEmpty v-if="!list.length && !loading" description="还没有更新日志，点右上角新增" />
      <div v-else class="changelog-list">
        <div v-for="row in list" :key="row.id" class="changelog-card">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <ElTag size="small" type="primary" effect="plain">v{{ row.version }}</ElTag>
                <span class="text-base font-medium text-g-900">
                  {{ row.title || '版本更新' }}
                </span>
                <ElTag size="small" :type="row.published === false ? 'info' : 'success'">
                  {{ row.published === false ? '未发布' : '已发布' }}
                </ElTag>
              </div>
              <div class="text-xs text-g-500 mt-1">{{ row.date }}</div>
            </div>
            <ElSpace wrap>
              <ElButton link type="primary" @click="openEdit(row)">编辑</ElButton>
              <ElButton
                link
                :type="row.published === false ? 'success' : 'warning'"
                @click="togglePublish(row)"
              >
                {{ row.published === false ? '发布' : '下架' }}
              </ElButton>
              <ElButton link type="danger" @click="remove(row)">删除</ElButton>
            </ElSpace>
          </div>
          <ul class="changelog-items mt-3 mb-0">
            <li v-for="(item, idx) in row.items || []" :key="idx">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>

    <ElDialog
      v-model="formOpen"
      :title="editing ? '编辑更新日志' : '新增更新日志'"
      width="560px"
      align-center
      destroy-on-close
    >
      <ElForm label-position="top" size="default">
        <div class="grid grid-cols-2 gap-3">
          <ElFormItem label="版本号" required>
            <ElInput v-model="form.version" maxlength="32" placeholder="例如 1.4.0" />
          </ElFormItem>
          <ElFormItem label="日期" required>
            <ElDatePicker
              v-model="form.date"
              type="date"
              value-format="YYYY-MM-DD"
              class="!w-full"
              placeholder="选择日期"
            />
          </ElFormItem>
        </div>
        <ElFormItem label="标题">
          <ElInput
            v-model="form.title"
            maxlength="48"
            show-word-limit
            placeholder="例如：语音体验升级（可空）"
          />
        </ElFormItem>
        <ElFormItem label="更新内容（一行一条）" required>
          <ElInput
            v-model="form.itemsText"
            type="textarea"
            :rows="8"
            maxlength="2400"
            show-word-limit
            placeholder="例如：&#10;新增关于页更新日志&#10;优化 AI 朗读音色选择&#10;修复语音房偶发断线"
          />
          <div class="text-xs text-g-400 mt-1 leading-5">
            每行一条，面向用户的专业表述；发布后显示在 App 关于页
          </div>
        </ElFormItem>
        <ElFormItem label="立即发布" class="!mb-0">
          <ElSwitch v-model="form.published" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="formOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'

  defineOptions({ name: 'XhamilChangelog' })

  type Row = {
    id: string
    version: string
    title?: string
    date: string
    items: string[]
    published?: boolean
  }

  const loading = ref(false)
  const saving = ref(false)
  const list = ref<Row[]>([])
  const formOpen = ref(false)
  const editing = ref<Row | null>(null)
  const form = reactive({
    version: '',
    title: '',
    date: '',
    itemsText: '',
    published: true
  })

  function today() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
  }

  async function load() {
    loading.value = true
    try {
      const data = await xhamilApi.getChangelog()
      list.value = data?.list || []
    } finally {
      loading.value = false
    }
  }

  function openCreate() {
    editing.value = null
    Object.assign(form, {
      version: '',
      title: '',
      date: today(),
      itemsText: '',
      published: true
    })
    formOpen.value = true
  }

  function openEdit(row: Row) {
    editing.value = row
    Object.assign(form, {
      version: row.version || '',
      title: row.title || '',
      date: row.date || today(),
      itemsText: (row.items || []).join('\n'),
      published: row.published !== false
    })
    formOpen.value = true
  }

  async function save() {
    if (!form.version.trim()) {
      ElMessage.error('请填写版本号')
      return
    }
    if (!form.itemsText.trim()) {
      ElMessage.error('请至少写一条更新内容')
      return
    }
    const body = {
      version: form.version.trim(),
      title: form.title.trim(),
      date: form.date || today(),
      items: form.itemsText,
      published: form.published
    }
    saving.value = true
    try {
      if (editing.value?.id) {
        await xhamilApi.updateChangelog(editing.value.id, body)
      } else {
        await xhamilApi.createChangelog(body)
      }
      formOpen.value = false
      await load()
    } finally {
      saving.value = false
    }
  }

  async function togglePublish(row: Row) {
    await xhamilApi.updateChangelog(row.id, {
      version: row.version,
      title: row.title || '',
      date: row.date,
      items: row.items || [],
      published: row.published === false
    })
    await load()
  }

  async function remove(row: Row) {
    await ElMessageBox.confirm(`删除 v${row.version} 的更新日志？`, '删除', { type: 'warning' })
    await xhamilApi.deleteChangelog(row.id)
    await load()
  }

  onMounted(load)
</script>

<style scoped>
  .changelog-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .changelog-card {
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 12px;
    padding: 14px 16px;
    background: var(--el-bg-color);
  }

  .changelog-items {
    padding-left: 1.1rem;
    color: var(--el-text-color-regular);
    font-size: 13px;
    line-height: 1.7;
  }

  .changelog-items li + li {
    margin-top: 2px;
  }
</style>
