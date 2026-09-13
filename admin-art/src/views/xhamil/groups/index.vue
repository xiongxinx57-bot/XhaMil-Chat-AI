<!-- 群聊管理：Art Design Pro 表格布局 -->
<template>
  <div class="groups-page art-full-height">
    <ArtSearchBar
      v-model="searchForm"
      :items="searchItems"
      @search="handleSearch"
      @reset="handleReset"
    />

    <ElCard class="art-table-card" shadow="never">
      <ArtTableHeader v-model:columns="columnChecks" :loading="loading" @refresh="load">
        <template #left>
          <ElSpace wrap>
            <span class="text-sm text-g-600">建群上限</span>
            <ElInputNumber v-model="maxOwned" :min="0" :max="500" controls-position="right" />
            <ElButton type="primary" :loading="savingMax" v-ripple @click="saveMax">
              保存上限
            </ElButton>
          </ElSpace>
        </template>
      </ArtTableHeader>

      <ArtTable
        :loading="loading"
        :data="paged"
        :columns="columns"
        :pagination="pagination"
        @pagination:size-change="onSizeChange"
        @pagination:current-change="onCurrentChange"
      />
    </ElCard>

    <ElDrawer v-model="chatOpen" :title="chatTitle" size="480px">
      <div v-loading="chatLoading">
        <ElButton v-if="hasMore" class="w-full mb-3" :loading="chatLoading" @click="loadMore">
          加载更早消息
        </ElButton>
        <div v-if="!messages.length" class="text-center text-g-400 py-10">暂无消息</div>
        <div v-for="m in messages" :key="m.id" class="msg-card mb-2">
          <div class="flex justify-between text-xs text-g-500 mb-1">
            <span>{{ sender(m) }}</span>
            <span>{{ fmt(m.createdAt) }}</span>
          </div>
          <div class="text-sm whitespace-pre-wrap break-words">{{ preview(m) }}</div>
          <img
            v-if="m.imageUrl && !m.deleted && String(m.messageType || m.type || '').toLowerCase() !== 'voice'"
            :src="m.imageUrl"
            alt=""
            class="msg-thumb mt-2"
          />
        </div>
      </div>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  import { ElButton, ElMessageBox, ElTag } from 'element-plus'
  import { useTableColumns } from '@/hooks/core/useTableColumns'
  import { xhamilApi } from '@/api/xhamil'

  defineOptions({ name: 'XhamilGroups' })

  type GroupRow = Record<string, any>

  const loading = ref(false)
  const savingMax = ref(false)
  const list = ref<GroupRow[]>([])
  const maxOwned = ref(0)
  const searchForm = ref({ keyword: '', status: '' })
  const applied = ref({ keyword: '', status: '' })
  const page = reactive({ current: 1, size: 20 })
  const chatOpen = ref(false)
  const chatLoading = ref(false)
  const viewGroup = ref<GroupRow | null>(null)
  const messages = ref<any[]>([])
  const hasMore = ref(false)

  const searchItems = [
    {
      label: '关键词',
      key: 'keyword',
      type: 'input',
      clearable: true,
      placeholder: '群名 / 群号 / 群主 / 聊聊号 / 邮箱 / 分配功能'
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部',
        options: [
          { label: '正常', value: 'normal' },
          { label: '已封禁', value: 'banned' }
        ]
      }
    }
  ]

  const filtered = computed(() => {
    const q = applied.value.keyword.trim().toLowerCase()
    const st = applied.value.status
    return list.value.filter((g) => {
      if (st === 'banned' && !g.banned) return false
      if (st === 'normal' && g.banned) return false
      if (!q) return true
      return [
        g.name,
        g.groupCode,
        g.ownerUsername,
        g.ownerNickname,
        g.ownerEmail,
        String(g.ownerChatNo ?? ''),
        String(g.id),
        String(g.ownerId ?? ''),
        ...(Array.isArray(g.assignments) ? g.assignments : [])
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  })

  const pagination = computed(() => ({
    current: page.current,
    size: page.size,
    total: filtered.value.length
  }))

  const paged = computed(() => {
    const start = (page.current - 1) * page.size
    return filtered.value.slice(start, start + page.size)
  })

  const chatTitle = computed(
    () => `${viewGroup.value?.name || '群聊'} · ${viewGroup.value?.groupCode || ''}`
  )

  function actionBtn(label: string, type: string, onClick: () => void) {
    return h(ElButton, { link: true, type: type as any, onClick }, () => label)
  }

  const { columns, columnChecks } = useTableColumns(() => [
    { type: 'index', width: 60, label: '序号' },
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'name', label: '群名', minWidth: 140 },
    { prop: 'groupCode', label: '群号', width: 130 },
    {
      prop: 'owner',
      label: '群主',
      minWidth: 160,
      formatter: (row: GroupRow) => {
        const nick = String(row.ownerNickname || '').trim()
        const user = String(row.ownerUsername || '').trim()
        if (nick && user && nick !== user) return `${nick}（${user}）`
        return nick || user || (row.ownerId != null ? `ID ${row.ownerId}` : '—')
      }
    },
    {
      prop: 'assignments',
      label: '已分配功能',
      minWidth: 180,
      formatter: (row: GroupRow) => {
        const list = Array.isArray(row.assignments) ? row.assignments.filter(Boolean) : []
        if (!list.length) return h('span', { class: 'text-g-400 text-xs' }, '—')
        return h(
          'div',
          { class: 'flex flex-wrap gap-1' },
          list.map((t: string) =>
            h(ElTag, { size: 'small', type: 'info', class: 'm-0' }, () => t)
          )
        )
      }
    },
    {
      prop: 'ownerChatNo',
      label: '聊聊号',
      width: 120,
      formatter: (row: GroupRow) => row.ownerChatNo || '—'
    },
    {
      prop: 'ownerEmail',
      label: '群主邮箱',
      minWidth: 160,
      showOverflowTooltip: true,
      formatter: (row: GroupRow) => row.ownerEmail || '—'
    },
    { prop: 'memberCount', label: '人数', width: 80 },
    {
      prop: 'status',
      label: '状态',
      width: 90,
      formatter: (row: GroupRow) =>
        h(ElTag, { type: row.banned ? 'danger' : 'success', size: 'small' }, () =>
          row.banned ? '已封禁' : '正常'
        )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 240,
      fixed: 'right',
      formatter: (row: GroupRow) =>
        h('div', { class: 'flex flex-wrap items-center' }, [
          actionBtn('查看聊天', 'primary', () => openChat(row)),
          actionBtn(row.banned ? '解封' : '封群', row.banned ? 'success' : 'warning', () =>
            toggleBan(row)
          ),
          actionBtn('解散', 'danger', () => dissolve(row))
        ])
    }
  ])

  function handleSearch() {
    applied.value = { ...searchForm.value }
    page.current = 1
  }
  function handleReset() {
    searchForm.value = { keyword: '', status: '' }
    applied.value = { keyword: '', status: '' }
    page.current = 1
  }
  function onSizeChange(size: number) {
    page.size = size
    page.current = 1
  }
  function onCurrentChange(current: number) {
    page.current = current
  }

  function fmt(v: string) {
    if (!v) return '—'
    return String(v).replace('T', ' ').slice(0, 19)
  }
  function sender(m: any) {
    const t = String(m.messageType || m.type || '').toLowerCase()
    if (t === 'butler') return '群管家'
    if (t === 'ai') return m.nickname || '群 AI'
    return m.nickname || m.username || (m.userId != null ? `用户 ${m.userId}` : '未知')
  }
  function preview(m: any) {
    if (m.deleted) return '[已删除]'
    const t = String(m.messageType || m.type || '').toLowerCase()
    if (t === 'announcement') return '[群公告]'
    if (t === 'multi_chat_invite') return '[多人通话邀请]'
    if (t === 'draw_guess_invite') return '[你画我猜]'
    if (t === 'multi_chat_live') return '[多人通话进行中]'
    if (t === 'voice' || m.voiceUrl) {
      const sec = Number(m.voiceDuration)
      return Number.isFinite(sec) && sec > 0 ? `[语音 ${Math.round(sec)}s]` : '[语音]'
    }
    const text = String(m.content || '').trim()
    if (text) return text
    if (m.imageUrl) return '[图片]'
    return t || '—'
  }

  async function load() {
    loading.value = true
    try {
      const data = await xhamilApi.getChatGroups()
      list.value = data?.groups || data?.list || (Array.isArray(data) ? data : [])
      const max = Number((data as any)?.maxOwnedGroupsPerUser)
      if (Number.isFinite(max)) maxOwned.value = max
    } finally {
      loading.value = false
    }
  }

  async function saveMax() {
    savingMax.value = true
    try {
      await xhamilApi.setMaxOwnedGroups(maxOwned.value)
      await load()
    } finally {
      savingMax.value = false
    }
  }

  async function toggleBan(row: GroupRow) {
    if (row.banned) await xhamilApi.unbanChatGroup(row.id)
    else await xhamilApi.banChatGroup(row.id)
    await load()
  }

  async function dissolve(row: GroupRow) {
    await ElMessageBox.confirm(`强制解散「${row.name}」？不可恢复`, '解散群聊', { type: 'warning' })
    await xhamilApi.deleteChatGroup(row.id)
    await load()
  }

  async function openChat(row: GroupRow) {
    viewGroup.value = row
    messages.value = []
    hasMore.value = false
    chatOpen.value = true
    await fetchMessages()
  }

  async function fetchMessages(beforeId?: number) {
    if (!viewGroup.value) return
    chatLoading.value = true
    try {
      const data = await xhamilApi.getChatGroupMessages(viewGroup.value.id, {
        limit: 50,
        beforeId
      })
      const pack = data?.list || []
      messages.value = beforeId ? pack.concat(messages.value) : pack
      hasMore.value = !!data?.hasMore
    } finally {
      chatLoading.value = false
    }
  }

  function loadMore() {
    if (!messages.value.length) return
    return fetchMessages(messages.value[0].id)
  }

  onMounted(load)
</script>

<style scoped>
  .msg-card {
    border: 1px solid var(--art-border-color, #eef2f7);
    background: var(--art-bg-color, #f8fafc);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .msg-thumb {
    display: block;
    max-width: 180px;
    max-height: 180px;
    border-radius: 8px;
    object-fit: cover;
  }
</style>
