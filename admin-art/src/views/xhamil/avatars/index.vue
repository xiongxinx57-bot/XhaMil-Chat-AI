<!-- 头像管理 · 对齐现网：使用中/未使用、引用、禁删 -->
<template>
  <div class="avatars-page" v-loading="loading">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">头像</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">
          {{ list.length }} 个 · {{ formatBytes(totalSize) }} · 未使用 {{ unusedCount }}
          <span v-if="inUseCount"> / 使用中 {{ inUseCount }}</span>
        </p>
      </div>
      <ElSpace wrap>
        <ElUpload :show-file-list="false" :http-request="onUpload" accept="image/*">
          <ElButton type="primary">上传头像</ElButton>
        </ElUpload>
        <ElButton :loading="loading" @click="load">刷新</ElButton>
      </ElSpace>
    </div>

    <ElEmpty v-if="!list.length" description="暂无头像文件" />
    <div v-else class="avatar-grid">
      <div v-for="item in list" :key="item.filename" class="avatar-card">
        <div class="avatar-preview">
          <img :src="item.url" :alt="item.filename" />
        </div>
        <div class="avatar-body">
          <div class="text-sm font-medium truncate" :title="item.filename">{{ item.filename }}</div>
          <div class="text-xs text-g-500 mt-1">
            {{ formatBytes(item.size) }} · {{ fmtTime(item.updatedAt || item.createdAt) }}
          </div>
          <div class="flex flex-wrap gap-1 mt-2">
            <ElTag v-if="item.isDefault" size="small" type="primary" effect="plain">默认</ElTag>
            <ElTag v-if="item.inUse && !item.isDefault" size="small" type="success" effect="plain">
              使用中
            </ElTag>
            <ElTag v-else-if="!item.isDefault" size="small" type="info" effect="plain">未使用</ElTag>
          </div>
          <div v-if="item.usedBy?.length" class="refs mt-2">
            <div v-for="(u, i) in item.usedBy.slice(0, 3)" :key="i" class="text-xs text-g-500 truncate">
              {{ usageLabel(u) }}
            </div>
            <div v-if="item.usedBy.length > 3" class="text-xs text-g-400">
              …共 {{ item.usedBy.length }} 处引用
            </div>
          </div>
          <div class="mt-3">
            <ElTooltip
              v-if="item.inUse && !item.isDefault"
              content="使用中，不可删除"
              placement="top"
            >
              <span>
                <ElButton size="small" type="danger" plain disabled>删除</ElButton>
              </span>
            </ElTooltip>
            <ElButton
              v-else-if="!item.isDefault"
              size="small"
              type="danger"
              plain
              @click="remove(item)"
            >
              删除
            </ElButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import type { UploadRequestOptions } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'

  defineOptions({ name: 'XhamilAvatars' })

  const loading = ref(false)
  const list = ref<any[]>([])
  const totalSize = ref(0)

  const inUseCount = computed(
    () => list.value.filter((i) => i.inUse && !i.isDefault).length
  )
  const unusedCount = computed(
    () => list.value.filter((i) => !i.inUse && !i.isDefault).length
  )

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

  function usageLabel(u: any) {
    const type = String(u?.type || '')
    if (type === 'ai_bot') return `群 AI：${u.nickname || u.username || '—'}`
    if (type === 'conversation' && u.convType === 'group') {
      return u.groupCode ? `群聊：群号 ${u.groupCode}` : `群聊：${u.username || '—'}`
    }
    if (type === 'conversation') return `会话：${u.username || '—'}`
    const nick = String(u?.nickname || '').trim()
    const user = String(u?.username || '').trim()
    if (nick && user && nick !== user) return `用户：${nick} (${user})`
    return `用户：${nick || user || '—'}`
  }

  async function load() {
    loading.value = true
    try {
      const data = await xhamilApi.getAvatars()
      list.value = data?.list || []
      totalSize.value = Number(data?.totalSize) || 0
    } finally {
      loading.value = false
    }
  }

  async function onUpload(opt: UploadRequestOptions) {
    try {
      await xhamilApi.uploadAvatar(opt.file as File)
      ElMessage.success('上传成功')
      await load()
      opt.onSuccess?.({} as any)
    } catch (e: any) {
      opt.onError?.(e)
    }
  }

  async function remove(item: any) {
    if (item.inUse) {
      ElMessage.warning('该头像仍被引用，删除将失败')
      return
    }
    await ElMessageBox.confirm(
      '仅删除磁盘文件，数据库引用需用户重新上传头像。',
      `删除「${item.filename}」`,
      { type: 'warning' }
    )
    await xhamilApi.deleteAvatarFile(item.filename)
    ElMessage.success('已删除')
    await load()
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .avatar-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }

  .avatar-card {
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
    overflow: hidden;
    background: var(--el-bg-color);
  }

  .avatar-preview {
    aspect-ratio: 1;
    background: var(--el-fill-color-lighter);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  .avatar-body {
    padding: 12px;
  }

  .refs {
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--el-fill-color-lighter);
  }
</style>
