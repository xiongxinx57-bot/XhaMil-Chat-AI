<!-- 官方图标管理 -->
<template>
  <div class="icons-page" v-loading="loading">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">官方图标</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">Official Images · 点击「替换」更新同名文件</p>
        <p v-if="dir" class="text-xs text-g-400 mt-1 mb-0 font-mono">{{ dir }}</p>
      </div>
      <ElButton :loading="loading" v-ripple @click="load">刷新</ElButton>
    </div>

    <input
      ref="fileRef"
      type="file"
      accept=".png,.jpg,.jpeg,.webp,.gif,.svg,.ico,image/*"
      hidden
      @change="onFile"
    />

    <div v-if="!icons.length && !loading" class="art-card p-8 text-center text-g-500">
      Official Images 目录暂无图片
    </div>

    <ElRow v-else :gutter="16">
      <ElCol v-for="item in icons" :key="item.filename" :xs="24" :lg="12" class="mb-4">
        <div class="art-card p-4">
          <div class="flex gap-4">
            <ElImage
              :src="mediaUrl(item.url)"
              :preview-src-list="[mediaUrl(item.url)]"
              fit="cover"
              class="icon-thumb"
            />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-g-900 truncate" :title="item.filename">
                {{ item.filename }}
              </div>
              <div v-if="item.size != null" class="text-xs text-g-400 mt-1">
                {{ formatSize(item.size) }}
              </div>
              <div class="text-xs text-g-400 mt-1 break-all">{{ item.url }}</div>
              <div class="mt-3 flex flex-wrap gap-2">
                <ElTag
                  v-for="usage in usagesOf(item.filename)"
                  :key="usage"
                  size="small"
                  type="info"
                >
                  {{ usage }}
                </ElTag>
              </div>
              <ElButton
                class="mt-3"
                type="primary"
                size="small"
                :loading="replacing === item.filename"
                v-ripple
                @click="pickReplace(item.filename)"
              >
                替换
              </ElButton>
            </div>
          </div>
        </div>
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'
  import { mediaUrl } from '@/utils/xhamilMedia'

  defineOptions({ name: 'XhamilIcons' })

  /** 本项目的官方图用途说明（与 React ICON_USAGE_MAP 一致） */
  const ICON_USAGE_MAP: Record<string, string[]> = {
    'XhaMilAI.jpg': ['登录页 / 注册页 Logo', '管理后台登录页 / 侧边栏 Logo'],
    'phone logo.png': ['Android / 手机端 App 图标'],
    'image.png': ['默认用户头像', '无头像时前端 / 后端回退图'],
    'avatar 2.png': ['默认群聊头像'],
    'chatBg.jpeg': ['群聊页面背景 · 群聊背景 1'],
    'chatBg2.jpeg': ['群聊页面背景 · 群聊背景 2'],
    'chatBg3.jpeg': ['群聊页面背景 · 群聊背景 3'],
    'Voice Room.jpeg': ['多人聊天背景 · 背景 1'],
    'Voice Room2.jpeg': ['多人聊天背景 · 背景 2'],
    'Voice Room3.jpeg': ['多人聊天背景 · 背景 3'],
    'Voice Room4.jpeg': ['多人聊天背景 · 背景 4']
  }

  const loading = ref(false)
  const replacing = ref('')
  const dir = ref('')
  const icons = ref<{ filename: string; url: string; size?: number; path?: string }[]>([])
  const fileRef = ref<HTMLInputElement | null>(null)
  const targetFilename = ref('')

  function formatSize(bytes?: number) {
    if (!bytes || bytes < 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  function usagesOf(filename: string) {
    return ICON_USAGE_MAP[filename] || ['暂未标注用途（可继续补充）']
  }

  async function load() {
    loading.value = true
    try {
      const data = await xhamilApi.getOfficialIcons()
      dir.value = data?.dir || ''
      icons.value = data?.icons || []
    } finally {
      loading.value = false
    }
  }

  function pickReplace(filename: string) {
    targetFilename.value = filename
    fileRef.value?.click()
  }

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    const name = targetFilename.value
    input.value = ''
    if (!file || !name) return
    replacing.value = name
    try {
      await xhamilApi.replaceOfficialIcon(name, file)
      ElMessage.success(`已替换 ${name}`)
      await load()
    } finally {
      replacing.value = ''
      targetFilename.value = ''
    }
  }

  onMounted(load)
</script>

<style scoped>
  .icon-thumb {
    width: 80px;
    height: 80px;
    border-radius: 8px;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--el-fill-color-light);
  }

  .icon-thumb :deep(img) {
    width: 80px;
    height: 80px;
    object-fit: cover;
  }
</style>
