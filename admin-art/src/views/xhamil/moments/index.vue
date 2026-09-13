<!-- 说说管理 -->
<template>
  <div class="moments-page">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">说说管理</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">按用户查看 / 删除说说、评论与点赞</p>
      </div>
      <ElButton :loading="loading" v-ripple @click="() => load()">刷新</ElButton>
    </div>

    <ElRow :gutter="16" class="mb-4">
      <ElCol :xs="24" :sm="8" class="mb-3">
        <div class="art-card p-4">
          <div class="text-sm text-g-500 mb-1">全部用户</div>
          <div class="text-2xl font-semibold">{{ total }}</div>
        </div>
      </ElCol>
      <ElCol :xs="24" :sm="8" class="mb-3">
        <div class="art-card p-4">
          <div class="text-sm text-g-500 mb-1">发过说说的用户</div>
          <div class="text-2xl font-semibold">{{ postedUsers }}</div>
        </div>
      </ElCol>
      <ElCol :xs="24" :sm="8" class="mb-3">
        <div class="art-card p-4">
          <div class="text-sm text-g-500 mb-1">说说条数（当前页合计）</div>
          <div class="text-2xl font-semibold">{{ momentsTotal }}</div>
        </div>
      </ElCol>
    </ElRow>

    <div class="art-card p-4">
      <div class="mb-4 flex flex-wrap gap-2 max-w-xl">
        <ElInput
          v-model="searchInput"
          clearable
          placeholder="搜索用户名、昵称或聊聊号"
          @keyup.enter="handleSearch"
          @clear="handleClear"
        />
        <ElButton type="primary" v-ripple @click="handleSearch">搜索</ElButton>
      </div>

      <ElTable
        v-loading="loading"
        :data="users"
        stripe
        size="small"
        row-key="id"
        empty-text="暂无用户"
        @row-click="openUserMoments"
      >
        <ElTableColumn label="用户" min-width="200">
          <template #default="{ row }">
            <div class="flex items-center gap-2 cursor-pointer">
              <ElAvatar :size="32" :src="avatarSrc(row.avatarUrl)">
                {{ (row.nickname || row.username || '?').slice(0, 1) }}
              </ElAvatar>
              <div class="min-w-0">
                <div class="font-medium truncate">{{ displayName(row) }}</div>
                <div class="text-xs text-g-400 font-mono">ID {{ row.id }}</div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="聊聊号" width="100">
          <template #default="{ row }">
            <span v-if="row.chatNo != null" class="font-mono text-xs">{{ row.chatNo }}</span>
            <span v-else class="text-g-400">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="说说数" width="90">
          <template #default="{ row }">
            <ElTag :type="(row.momentCount || 0) > 0 ? 'primary' : 'info'" size="small">
              {{ row.momentCount ?? 0 }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="最近发布" width="170">
          <template #default="{ row }">
            <span class="font-mono text-xs">{{ fmtTime(row.lastMomentAt) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click.stop="openUserMoments(row)">查看说说</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <ElDrawer
      v-model="drawerOpen"
      :title="drawerTitle"
      size="560px"
      destroy-on-close
      @close="closeDrawer"
    >
      <div v-loading="momentsLoading">
        <div v-if="!moments.length && !momentsLoading" class="py-12 text-center text-g-500">
          暂无说说
        </div>
        <div v-else class="flex flex-col gap-3">
          <div v-for="m in moments" :key="m.id" class="moment-card">
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <ElTag size="small">{{ visibilityLabel(m.visibility) }}</ElTag>
                <span class="text-xs text-g-400 font-mono">{{ fmtTime(m.createdAt) }}</span>
              </div>
              <ElButton
                type="danger"
                size="small"
                :loading="deletingId === m.id"
                @click="handleDeleteMoment(m)"
              >
                删除
              </ElButton>
            </div>

            <div v-if="m.content" class="text-sm whitespace-pre-wrap break-words mb-2">
              {{ m.content }}
            </div>

            <div v-if="mediaItems(m).length" class="grid grid-cols-3 gap-1.5 mb-2">
              <template v-for="(item, i) in mediaItems(m)" :key="`${m.id}-${i}`">
                <a
                  v-if="isVideo(item)"
                  :href="mediaUrl(mediaItemUrl(item))"
                  target="_blank"
                  rel="noreferrer"
                  class="media-video-link"
                >
                  视频
                  <template v-if="typeof item !== 'string' && item.duration">
                    {{ Math.round(item.duration) }}s
                  </template>
                </a>
                <ElImage
                  v-else
                  :src="mediaUrl(mediaItemUrl(item))"
                  :preview-src-list="imagePreviewList(m)"
                  fit="cover"
                  class="media-img"
                />
              </template>
            </div>

            <div
              v-if="!m.content && !mediaItems(m).length"
              class="text-g-400 text-sm mb-2"
            >
              （空内容）
            </div>

            <div class="interaction-box">
              <div class="text-xs text-g-500 mb-2">
                {{ (m.likes || []).length }} 赞 · {{ (m.comments || []).length }} 评
              </div>

              <div v-if="(m.likes || []).length" class="mb-2">
                <div
                  v-for="u in m.likes"
                  :key="`like-${m.id}-${u.id}`"
                  class="flex items-center justify-between gap-2 text-sm py-0.5"
                >
                  <span class="truncate">
                    ♥ {{ personLabel(u) }}
                    <span class="text-xs text-g-400 font-mono ml-1">#{{ u.id }}</span>
                  </span>
                  <ElButton
                    link
                    type="danger"
                    size="small"
                    :loading="deletingLikeKey === `${m.id}-${u.id}`"
                    @click="handleDeleteLike(m.id, u.id)"
                  >
                    删除
                  </ElButton>
                </div>
              </div>
              <div v-else class="text-xs text-g-400 mb-2">暂无点赞</div>

              <div
                v-if="(m.comments || []).length"
                class="border-t border-[var(--el-border-color-lighter)] pt-2"
              >
                <div
                  v-for="c in m.comments"
                  :key="c.id"
                  class="flex items-start justify-between gap-2 mb-2"
                >
                  <div class="min-w-0 text-sm leading-snug">
                    <span class="font-medium">{{ personLabel(c.user) }}</span>
                    <template v-if="c.replyToUser">
                      <span class="text-g-400">
                        回复 <span class="text-g-700">{{ personLabel(c.replyToUser) }}</span>
                      </span>
                    </template>
                    <span>：{{ c.content }}</span>
                    <div class="text-xs text-g-400 font-mono mt-0.5">{{ fmtTime(c.createdAt) }}</div>
                  </div>
                  <ElButton
                    link
                    type="danger"
                    size="small"
                    :loading="deletingCommentId === c.id"
                    @click="handleDeleteComment(m.id, c.id)"
                  >
                    删除
                  </ElButton>
                </div>
              </div>
              <div v-else class="text-xs text-g-400 border-t border-[var(--el-border-color-lighter)] pt-2">
                暂无评论
              </div>
            </div>
          </div>
        </div>
      </div>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'
  import { avatarSrc, mediaUrl } from '@/utils/xhamilMedia'

  defineOptions({ name: 'XhamilMoments' })

  type MomentUser = Record<string, any>
  type MomentRow = Record<string, any>

  const VISIBILITY_LABEL: Record<string, string> = {
    friends: '好友可见',
    public: '公开',
    private: '仅自己'
  }

  const loading = ref(false)
  const users = ref<MomentUser[]>([])
  const total = ref(0)
  const keyword = ref('')
  const searchInput = ref('')

  const viewUser = ref<MomentUser | null>(null)
  const drawerOpen = ref(false)
  const moments = ref<MomentRow[]>([])
  const momentsLoading = ref(false)
  const deletingId = ref<number | null>(null)
  const deletingCommentId = ref<number | null>(null)
  const deletingLikeKey = ref<string | null>(null)

  const postedUsers = computed(() => users.value.filter((u) => (u.momentCount || 0) > 0).length)
  const momentsTotal = computed(() =>
    users.value.reduce((s, u) => s + (Number(u.momentCount) || 0), 0)
  )
  const drawerTitle = computed(() => {
    if (!viewUser.value) return '说说列表'
    return `${displayName(viewUser.value)} · ${viewUser.value.momentCount ?? 0} 条`
  })

  function fmtTime(v?: string | null) {
    if (!v) return '—'
    return String(v).replace('T', ' ').replace(/\.\d{3}Z?$/, '').slice(0, 19)
  }

  function displayName(row: MomentUser) {
    const nick = (row.nickname || '').trim()
    const user = (row.username || '').trim()
    if (nick && user && nick !== user) return `${nick}（${user}）`
    return nick || user || `ID ${row.id}`
  }

  function personLabel(u?: { nickname?: string; username?: string; id?: number }) {
    if (!u) return '用户'
    const nick = (u.nickname || '').trim()
    const user = (u.username || '').trim()
    if (nick) return nick
    if (user) return user
    return u.id != null ? `用户${u.id}` : '用户'
  }

  function visibilityLabel(v?: string) {
    return VISIBILITY_LABEL[v || ''] || v || '—'
  }

  function mediaItems(m: MomentRow) {
    if (Array.isArray(m.media) && m.media.length) return m.media
    return (m.images || []).map((url: string) => ({ url, type: 'image' }))
  }

  function mediaItemUrl(item: any) {
    return typeof item === 'string' ? item : item?.url || ''
  }

  function isVideo(item: any) {
    const src = mediaItemUrl(item)
    return (
      (typeof item !== 'string' && item?.type === 'video') || /Moments(%20)?Videos/i.test(src)
    )
  }

  function imagePreviewList(m: MomentRow) {
    return mediaItems(m)
      .filter((item: any) => !isVideo(item))
      .map((item: any) => mediaUrl(mediaItemUrl(item)))
      .filter(Boolean)
  }

  async function load(kw = keyword.value) {
    loading.value = true
    try {
      const data = await xhamilApi.getMomentUsers({ keyword: kw, limit: 200 })
      users.value = data?.list || []
      total.value = data?.total ?? users.value.length
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    keyword.value = searchInput.value.trim()
    load(keyword.value)
  }

  function handleClear() {
    searchInput.value = ''
    keyword.value = ''
    load('')
  }

  function closeDrawer() {
    drawerOpen.value = false
    viewUser.value = null
    moments.value = []
  }

  async function openUserMoments(row: MomentUser) {
    viewUser.value = row
    drawerOpen.value = true
    moments.value = []
    momentsLoading.value = true
    try {
      const res = await xhamilApi.getUserMoments(row.id, { limit: 100 })
      moments.value = res?.list || []
    } catch {
      closeDrawer()
    } finally {
      momentsLoading.value = false
    }
  }

  async function handleDeleteMoment(moment: MomentRow) {
    await ElMessageBox.confirm('删除这条说说？将同时删除点赞与评论，不可恢复', '删除说说', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    deletingId.value = moment.id
    try {
      await xhamilApi.deleteMoment(moment.id)
      ElMessage.success('已删除')
      moments.value = moments.value.filter((m) => m.id !== moment.id)
      users.value = users.value.map((u) => {
        if (u.id !== moment.userId) return u
        return {
          ...u,
          momentCount: Math.max(0, (u.momentCount || 0) - 1),
          lastMomentAt: (u.momentCount || 0) <= 1 ? null : u.lastMomentAt
        }
      })
      if (viewUser.value?.id === moment.userId) {
        const vu = viewUser.value!
        viewUser.value = {
          ...vu,
          momentCount: Math.max(0, (vu.momentCount || 0) - 1)
        }
      }
    } finally {
      deletingId.value = null
    }
  }

  async function handleDeleteComment(momentId: number, commentId: number) {
    await ElMessageBox.confirm('删除这条评论？', '删除评论', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    deletingCommentId.value = commentId
    try {
      await xhamilApi.deleteMomentComment(commentId)
      ElMessage.success('已删除评论')
      moments.value = moments.value.map((m) =>
        m.id !== momentId
          ? m
          : { ...m, comments: (m.comments || []).filter((c: any) => c.id !== commentId) }
      )
    } finally {
      deletingCommentId.value = null
    }
  }

  async function handleDeleteLike(momentId: number, userId: number) {
    await ElMessageBox.confirm('移除这个点赞？', '移除点赞', {
      type: 'warning',
      confirmButtonText: '移除',
      cancelButtonText: '取消'
    })
    const key = `${momentId}-${userId}`
    deletingLikeKey.value = key
    try {
      await xhamilApi.deleteMomentLike(momentId, userId)
      ElMessage.success('已移除点赞')
      moments.value = moments.value.map((m) =>
        m.id !== momentId
          ? m
          : { ...m, likes: (m.likes || []).filter((u: any) => u.id !== userId) }
      )
    } finally {
      deletingLikeKey.value = null
    }
  }

  onMounted(() => load())
</script>

<style scoped>
  .moment-card {
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    background: var(--el-fill-color-blank);
    padding: 12px;
  }

  .interaction-box {
    margin-top: 8px;
    border-radius: 6px;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
    padding: 10px;
  }

  .media-img {
    width: 100%;
    height: 96px;
    border-radius: 6px;
    overflow: hidden;
  }

  .media-img :deep(img) {
    width: 100%;
    height: 96px;
    object-fit: cover;
  }

  .media-video-link {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 96px;
    border-radius: 6px;
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);
    font-size: 12px;
    text-decoration: none;
  }

  :deep(.el-table__row) {
    cursor: pointer;
  }
</style>
