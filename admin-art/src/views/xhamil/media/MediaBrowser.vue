<!-- 通用媒体/文件浏览：图片 / 视频 / 音频 / 文件 -->
<template>
  <div class="media-browser-page" v-loading="loading">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">{{ title }}</h2>
        <p v-if="subtitle" class="text-sm text-g-500 mt-1 mb-0">{{ subtitle }}</p>
        <p v-if="dir" class="text-xs text-g-400 mt-1 mb-0 font-mono">{{ dir }}</p>
      </div>
      <ElSpace wrap>
        <ElButton :loading="loading" v-ripple @click="load">刷新</ElButton>
        <template v-if="uploadFn">
          <input ref="uploadRef" type="file" :accept="uploadAccept" hidden @change="onUpload" />
          <ElButton type="primary" :loading="uploading" v-ripple @click="pickUpload">上传</ElButton>
        </template>
        <ElButton
          v-if="deleteAllFn"
          type="danger"
          plain
          :disabled="!list.length"
          :loading="deletingAll"
          v-ripple
          @click="onDeleteAll"
        >
          一键删除全部
        </ElButton>
      </ElSpace>
    </div>

    <ElRow :gutter="16" class="mb-4">
      <ElCol :xs="24" :sm="12" :md="8" class="mb-3">
        <div class="art-card p-4">
          <div class="text-sm text-g-500 mb-1">{{ countLabel }}</div>
          <div class="text-2xl font-semibold text-g-900">{{ displayCount }}</div>
        </div>
      </ElCol>
      <ElCol :xs="24" :sm="12" :md="8" class="mb-3">
        <div class="art-card p-4">
          <div class="text-sm text-g-500 mb-1">占用空间</div>
          <div class="text-2xl font-semibold text-g-900">{{ formatSize(totalSize) }}</div>
        </div>
      </ElCol>
    </ElRow>

    <div v-if="!list.length && !loading" class="art-card p-8 text-center text-g-500">
      暂无数据
    </div>

    <!-- 图片 -->
    <ElRow v-else-if="kind === 'image'" :gutter="16">
      <ElCol
        v-for="item in list"
        :key="itemKey(item)"
        :xs="12"
        :sm="8"
        :md="6"
        :lg="4"
        class="mb-4"
      >
        <div class="art-card overflow-hidden">
          <ElImage
            :src="itemSrc(item)"
            :preview-src-list="previewList"
            :initial-index="previewIndex(item)"
            fit="cover"
            class="media-thumb"
            lazy
          />
          <div class="p-3">
            <div class="text-xs text-g-500 truncate" :title="itemName(item)">
              {{ itemName(item) }}
            </div>
            <div v-if="item.size != null" class="text-xs text-g-400 mt-1">
              {{ formatSize(item.size) }}
            </div>
            <ElButton
              class="mt-2"
              type="danger"
              link
              size="small"
              :loading="deleting === itemName(item)"
              @click="onDelete(item)"
            >
              删除
            </ElButton>
          </div>
        </div>
      </ElCol>
    </ElRow>

    <!-- 视频 -->
    <ElRow v-else-if="kind === 'video'" :gutter="16">
      <ElCol
        v-for="item in list"
        :key="itemKey(item)"
        :xs="24"
        :sm="12"
        :md="8"
        :lg="6"
        class="mb-4"
      >
        <div class="art-card p-3">
          <video
            v-if="itemSrc(item)"
            class="media-video"
            :src="itemSrc(item)"
            controls
            preload="metadata"
          />
          <div class="mt-2 text-xs text-g-500 truncate" :title="itemName(item)">
            {{ itemName(item) }}
          </div>
          <div class="flex items-center justify-between mt-2">
            <span class="text-xs text-g-400">{{ formatSize(item.size) }}</span>
            <ElSpace>
              <ElLink v-if="itemSrc(item)" :href="itemSrc(item)" target="_blank" type="primary">
                打开
              </ElLink>
              <ElButton
                type="danger"
                link
                size="small"
                :loading="deleting === itemName(item)"
                @click="onDelete(item)"
              >
                删除
              </ElButton>
            </ElSpace>
          </div>
        </div>
      </ElCol>
    </ElRow>

    <!-- 音频 -->
    <ElRow v-else-if="kind === 'audio'" :gutter="16">
      <ElCol v-for="item in list" :key="itemKey(item)" :xs="24" :sm="12" :md="8" class="mb-4">
        <div class="art-card p-4">
          <div class="text-sm font-medium truncate mb-2" :title="itemName(item)">
            {{ itemName(item) }}
          </div>
          <audio v-if="itemSrc(item)" class="w-full" :src="itemSrc(item)" controls preload="none" />
          <div class="flex items-center justify-between mt-3">
            <span class="text-xs text-g-400">{{ formatSize(item.size) }}</span>
            <ElButton
              type="danger"
              link
              size="small"
              :loading="deleting === itemName(item)"
              @click="onDelete(item)"
            >
              删除
            </ElButton>
          </div>
        </div>
      </ElCol>
    </ElRow>

    <!-- 文件表格 -->
    <div v-else class="art-card p-4">
      <ElTable :data="list" stripe size="small" empty-text="暂无文件">
        <ElTableColumn label="文件名" min-width="220">
          <template #default="{ row }">
            <div class="truncate" :title="displayFileName(row)">{{ displayFileName(row) }}</div>
            <div v-if="row.senderName" class="text-xs text-g-400">{{ row.senderName }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="大小" width="100">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </ElTableColumn>
        <ElTableColumn label="时间" width="160">
          <template #default="{ row }">
            {{ formatTime(row.createdAt || row.updatedAt) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <ElSpace>
              <ElLink
                v-if="itemSrc(row)"
                :href="itemSrc(row)"
                target="_blank"
                type="primary"
                :underline="false"
              >
                打开
              </ElLink>
              <ElButton
                v-if="itemName(row)"
                type="danger"
                link
                size="small"
                :loading="deleting === itemName(row)"
                @click="onDelete(row)"
              >
                删除
              </ElButton>
            </ElSpace>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { mediaUrl } from '@/utils/xhamilMedia'

  defineOptions({ name: 'MediaBrowser' })

  export type MediaLoadResult = {
    dir?: string
    list?: any[]
    totalSize?: number
    fileCount?: number
    groups?: any[]
  }

  const props = withDefaults(
    defineProps<{
      title: string
      subtitle?: string
      kind: 'image' | 'video' | 'audio' | 'file'
      loadFn: () => Promise<MediaLoadResult>
      deleteFn: (filename: string) => Promise<any>
      deleteAllFn?: () => Promise<{ deleted?: number }>
      uploadFn?: (file: File) => Promise<any>
      replaceFn?: (filename: string, file: File) => Promise<any>
      filenameKey?: string
      urlKey?: string
    }>(),
    {
      filenameKey: 'filename',
      urlKey: 'url'
    }
  )

  const loading = ref(false)
  const uploading = ref(false)
  const deletingAll = ref(false)
  const deleting = ref<string | null>(null)
  const dir = ref('')
  const list = ref<any[]>([])
  const totalSize = ref(0)
  const fileCount = ref<number | null>(null)
  const uploadRef = ref<HTMLInputElement | null>(null)

  const countLabel = computed(() => {
    if (props.kind === 'image') return '图片数量'
    if (props.kind === 'video') return '视频数量'
    if (props.kind === 'audio') return '语音数量'
    return '文件数量'
  })

  const displayCount = computed(() =>
    fileCount.value != null ? fileCount.value : list.value.length
  )

  const uploadAccept = computed(() => {
    if (props.kind === 'image') return 'image/*'
    if (props.kind === 'video') return 'video/*'
    if (props.kind === 'audio') return 'audio/*'
    return '*/*'
  })

  const previewList = computed(() =>
    list.value.map((item) => itemSrc(item)).filter(Boolean)
  )

  function formatSize(bytes?: number) {
    if (!bytes || bytes < 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  function formatTime(iso?: string) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function itemName(item: any) {
    return String(item?.[props.filenameKey] || item?.filename || '')
  }

  function displayFileName(item: any) {
    return String(item?.displayName || itemName(item) || '—')
  }

  function itemSrc(item: any) {
    return mediaUrl(
      item?.[props.urlKey] || item?.url || item?.avatarUrl || item?.path || item?.src
    )
  }

  function itemKey(item: any) {
    return itemName(item) || itemSrc(item) || JSON.stringify(item)
  }

  function previewIndex(item: any) {
    const src = itemSrc(item)
    const idx = previewList.value.indexOf(src)
    return idx >= 0 ? idx : 0
  }

  function flattenGroups(groups?: any[]) {
    if (!Array.isArray(groups)) return []
    const out: any[] = []
    for (const g of groups) {
      const files = g?.files || g?.list || []
      if (Array.isArray(files)) out.push(...files)
    }
    return out
  }

  async function load() {
    loading.value = true
    try {
      const data = await props.loadFn()
      dir.value = data?.dir || ''
      totalSize.value = Number(data?.totalSize) || 0
      fileCount.value = data?.fileCount != null ? Number(data.fileCount) : null
      let rows = Array.isArray(data?.list) ? data!.list! : []
      if (!rows.length && data?.groups) {
        rows = flattenGroups(data.groups)
      }
      list.value = rows
    } finally {
      loading.value = false
    }
  }

  function pickUpload() {
    uploadRef.value?.click()
  }

  async function onUpload(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || !props.uploadFn) return
    uploading.value = true
    try {
      await props.uploadFn(file)
      ElMessage.success('上传成功')
      await load()
    } finally {
      uploading.value = false
    }
  }

  async function onDelete(item: any) {
    const name = itemName(item)
    if (!name) return
    await ElMessageBox.confirm(`确定删除「${name}」？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    deleting.value = name
    try {
      await props.deleteFn(name)
      ElMessage.success('已删除')
      await load()
    } finally {
      deleting.value = null
    }
  }

  async function onDeleteAll() {
    if (!props.deleteAllFn) return
    await ElMessageBox.confirm('将清空全部文件，不可恢复。确定继续？', '一键删除全部', {
      type: 'warning',
      confirmButtonText: '全部删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    })
    deletingAll.value = true
    try {
      const result = await props.deleteAllFn()
      ElMessage.success(`已删除全部（${result?.deleted ?? list.value.length} 个）`)
      await load()
    } finally {
      deletingAll.value = false
    }
  }

  onMounted(load)
</script>

<style scoped>
  .media-thumb {
    width: 100%;
    height: 140px;
    display: block;
  }

  .media-thumb :deep(img) {
    width: 100%;
    height: 140px;
    object-fit: cover;
  }

  .media-video {
    width: 100%;
    max-height: 180px;
    background: #0f172a;
    border-radius: 6px;
  }
</style>
