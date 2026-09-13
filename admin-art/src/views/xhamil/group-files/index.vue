<!-- 群文件 · 对齐现网：按会话折叠 + 过期/软删/缺失 -->
<template>
  <div class="group-files-page" v-loading="loading">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">文件管理</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">
          {{ fileCount }} 个文件 · {{ formatBytes(totalSize) }}
          <span v-if="dir"> · {{ dir }}</span>
        </p>
      </div>
      <ElSpace wrap>
        <ElButton :loading="loading" @click="load">刷新</ElButton>
        <ElPopconfirm title="将清空磁盘上的全部群文件，并软删相关消息，不可恢复。" @confirm="deleteAll">
          <template #reference>
            <ElButton type="danger" plain :loading="deletingAll">一键删除全部</ElButton>
          </template>
        </ElPopconfirm>
      </ElSpace>
    </div>

    <div class="art-card p-4">
      <h3 class="text-base font-medium m-0 mb-4">
        聊天文件（群聊保留 {{ retentionDays }} 天 · 私聊保留 {{ directRetentionDays }} 天）
      </h3>

      <ElEmpty v-if="!groups.length" description="暂无文件" />
      <ElCollapse v-else v-model="activeKeys">
        <ElCollapseItem v-for="g in groups" :key="String(g.conversationId)" :name="String(g.conversationId)">
          <template #title>
            <div class="group-head">
              <ArtSvgIcon
                :icon="g.orphan ? 'ri:folder-forbid-line' : 'ri:folder-3-line'"
                :class="g.orphan ? 'text-g-400' : 'text-theme'"
              />
              <span class="font-medium truncate">{{ g.title || `会话 ${g.conversationId}` }}</span>
              <ElTag size="small" :type="g.convType === 'direct' ? 'warning' : 'primary'" effect="plain">
                {{ g.convType === 'direct' ? '私聊' : '群聊' }}
              </ElTag>
              <ElTag v-if="g.groupCode" size="small" effect="plain">{{ g.groupCode }}</ElTag>
              <ElTag v-if="g.orphan" size="small" type="info">磁盘残留</ElTag>
              <span class="text-xs text-g-500">
                {{ g.fileCount || g.files?.length || 0 }} 个文件 · {{ formatBytes(g.usedBytes) }}
              </span>
            </div>
          </template>

          <div
            v-for="f in g.files || []"
            :key="f.filename"
            class="file-row"
            :class="{ 'is-deleted': f.deleted }"
          >
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium truncate">{{ f.displayName || f.filename }}</div>
              <div class="text-xs text-g-500 mt-1">
                {{ formatBytes(f.size) }}
                · 上传 {{ fmtTime(f.createdAt || f.updatedAt) }}
                <span v-if="f.senderName"> · {{ f.senderName }}</span>
                <span v-if="f.deleted" class="text-danger"> · 已软删</span>
                <span v-if="f.onDisk === false" class="text-warning"> · 磁盘缺失</span>
              </div>
              <div v-if="f.expiresAt" class="text-xs mt-1" :class="remainClass(f.expiresAt)">
                到期 {{ fmtTime(f.expiresAt) }} · {{ remainText(f.expiresAt) }}
                （保留 {{ f.retentionDays ?? retentionDays }} 天）
              </div>
            </div>
            <ElSpace>
              <a v-if="f.url" :href="f.url" target="_blank" rel="noopener">
                <ElButton size="small">打开</ElButton>
              </a>
              <ElButton size="small" type="danger" plain @click="removeFile(f.filename)">删除</ElButton>
            </ElSpace>
          </div>
        </ElCollapseItem>
      </ElCollapse>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'

  defineOptions({ name: 'XhamilGroupFiles' })

  const loading = ref(false)
  const deletingAll = ref(false)
  const groups = ref<any[]>([])
  const activeKeys = ref<string[]>([])
  const fileCount = ref(0)
  const totalSize = ref(0)
  const dir = ref('')
  const retentionDays = ref(7)
  const directRetentionDays = ref(1)

  function formatBytes(n: unknown) {
    const v = Number(n) || 0
    if (v < 1024) return `${v} B`
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
    return `${(v / 1024 / 1024).toFixed(2)} MB`
  }

  function fmtTime(v?: string | null) {
    if (!v) return '—'
    return String(v).replace('T', ' ').slice(0, 19)
  }

  function remainText(expiresAt: string) {
    const ms = new Date(expiresAt).getTime() - Date.now()
    if (!Number.isFinite(ms) || ms <= 0) return '已到期'
    const mins = Math.max(1, Math.floor(ms / 60000))
    if (mins < 60) return `剩余 ${mins} 分钟`
    const hours = Math.floor(mins / 60)
    const remM = mins % 60
    if (hours < 24) return `剩余 ${hours} 小时 ${remM} 分钟`
    const days = Math.floor(hours / 24)
    const remH = hours % 24
    return `剩余 ${days} 天 ${remH} 小时`
  }

  function remainClass(expiresAt: string) {
    const ms = new Date(expiresAt).getTime() - Date.now()
    return ms <= 0 ? 'text-danger' : 'text-g-500'
  }

  async function load() {
    loading.value = true
    try {
      const data = await xhamilApi.getGroupFiles()
      groups.value = data?.groups || []
      fileCount.value = Number(data?.fileCount) || 0
      totalSize.value = Number(data?.totalSize) || 0
      dir.value = data?.dir || ''
      retentionDays.value = Number(data?.retentionDays) || 7
      directRetentionDays.value = Number(data?.directRetentionDays) || 1
      activeKeys.value = groups.value.map((g) => String(g.conversationId))
    } finally {
      loading.value = false
    }
  }

  async function removeFile(filename: string) {
    await ElMessageBox.confirm(`删除文件「${filename}」？`, '删除', { type: 'warning' })
    await xhamilApi.deleteGroupFile(filename)
    ElMessage.success('已删除')
    await load()
  }

  async function deleteAll() {
    deletingAll.value = true
    try {
      const res = await xhamilApi.deleteAllGroupFiles()
      ElMessage.success(`已删除 ${res?.deleted ?? ''}`.trim())
      await load()
    } finally {
      deletingAll.value = false
    }
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .group-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding-right: 8px;
  }

  .file-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--el-border-color-extra-light);

    &:last-child {
      border-bottom: 0;
    }

    &.is-deleted {
      background: #fafafa;
    }
  }

  .text-danger {
    color: var(--el-color-danger);
  }

  .text-warning {
    color: var(--el-color-warning);
  }
</style>
