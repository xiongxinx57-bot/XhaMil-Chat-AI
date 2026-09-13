<!-- 公共语音房管理 -->
<template>
  <div class="public-voice-rooms-page art-full-height">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">公共语音房</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">
          管理 App 公共语音房列表与实时状态 · 共 {{ list.length }} 个
        </p>
      </div>
      <ElSpace wrap>
        <ElButton :loading="loading" v-ripple @click="load">刷新</ElButton>
        <ElButton type="primary" v-ripple @click="openCreate">新建永久房</ElButton>
      </ElSpace>
    </div>

    <ElAlert
      v-if="loadError"
      class="mb-4"
      type="error"
      show-icon
      :closable="false"
      :title="loadError"
    />

    <ElAlert
      v-else
      class="mb-4"
      type="info"
      show-icon
      :closable="false"
      title="用户自建直播房（临时房）在创建者退出后自动删除；永久房由后台维护，可设密码与排序。"
    />

    <ElCard class="art-table-card" shadow="never">
      <ArtTableHeader :loading="loading" @refresh="load">
        <template #left>
          <ElSpace wrap>
            <span class="text-xs text-g-500">
              进行中 {{ liveCount }} · 临时房 {{ ephemeralCount }} · 已禁用 {{ disabledCount }}
            </span>
          </ElSpace>
        </template>
      </ArtTableHeader>

      <ElTable v-loading="loading" :data="list" row-key="id" stripe empty-text="暂无语音房">
        <ElTableColumn type="index" label="#" width="56" />
        <ElTableColumn prop="title" label="房间名称" min-width="140" show-overflow-tooltip />
        <ElTableColumn label="类型" width="96" align="center">
          <template #default="{ row }">
            <ElTag :type="row.isEphemeral ? 'warning' : 'primary'" size="small">
              {{ row.isEphemeral ? '用户直播' : '永久房' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="实时状态" width="110" align="center">
          <template #default="{ row }">
            <ElTag :type="row.liveActive ? 'success' : 'info'" size="small">
              {{ row.liveActive ? '进行中' : '空闲' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="在线" width="120" align="center">
          <template #default="{ row }">
            <span v-if="row.liveActive">
              {{ row.liveParticipantCount }} 人 · 麦 {{ row.liveOnMicCount }}
            </span>
            <span v-else class="text-g-400">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="成员/上限" width="110" align="center">
          <template #default="{ row }">
            {{ row.memberCount ?? 0 }} / {{ row.maxCapacity || 20 }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="创建者" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.creatorNickname || (row.isEphemeral ? '用户' : '系统') }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="密码" width="88" align="center">
          <template #default="{ row }">
            <ElTag :type="row.hasPassword ? 'warning' : 'info'" size="small">
              {{ row.hasPassword ? '有' : '无' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="启用" width="80" align="center">
          <template #default="{ row }">
            <ElTag :type="row.enabled ? 'success' : 'danger'" size="small">
              {{ row.enabled ? '是' : '否' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="sortOrder" label="排序" width="72" align="center" />
        <ElTableColumn label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="openEdit(row)">编辑</ElButton>
            <ElPopconfirm title="确定删除该语音房？" @confirm="remove(row.id)">
              <template #reference>
                <ElButton link type="danger">删除</ElButton>
              </template>
            </ElPopconfirm>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDialog
      v-model="dialogOpen"
      :title="editing ? '编辑语音房' : '新建永久语音房'"
      width="520px"
      destroy-on-close
      align-center
    >
      <ElForm label-position="top">
        <ElFormItem label="房间名称" required>
          <ElInput v-model="form.title" maxlength="32" show-word-limit placeholder="例如：深夜电台" />
        </ElFormItem>
        <ElFormItem label="入口提示">
          <ElInput v-model="form.entryHint" maxlength="64" placeholder="列表副标题，例如：点击进入一起聊天" />
        </ElFormItem>
        <ElFormItem label="人数上限">
          <ElInputNumber v-model="form.maxCapacity" :min="2" :max="500" class="w-full!" />
        </ElFormItem>
        <ElFormItem label="排序（越小越靠前）">
          <ElInputNumber v-model="form.sortOrder" :min="0" :max="9999" class="w-full!" />
        </ElFormItem>
        <ElFormItem label="背景图 URL">
          <ElInput v-model="form.backgroundUrl" placeholder="/media/Official Images/Voice Room.jpeg" />
        </ElFormItem>
        <ElFormItem label="访问密码">
          <ElInput
            v-model="form.password"
            type="password"
            show-password
            :placeholder="editing && form.hasPassword ? '留空不修改；勾选下方可清除' : '可选'"
          />
        </ElFormItem>
        <ElFormItem v-if="editing && form.hasPassword">
          <ElCheckbox v-model="form.clearPassword">清除密码</ElCheckbox>
        </ElFormItem>
        <ElFormItem label="启用">
          <ElSwitch v-model="form.enabled" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { xhamilApi, type PublicVoiceRoomItem } from '@/api/xhamil'

  defineOptions({ name: 'XhamilPublicVoiceRooms' })

  const loading = ref(false)
  const saving = ref(false)
  const loadError = ref('')
  const list = ref<PublicVoiceRoomItem[]>([])
  const dialogOpen = ref(false)
  const editing = ref(false)
  const editingId = ref(0)

  const form = reactive({
    title: '',
    entryHint: '点击进入一起聊天',
    maxCapacity: 20,
    sortOrder: 0,
    backgroundUrl: '',
    password: '',
    clearPassword: false,
    hasPassword: false,
    enabled: true
  })

  const liveCount = computed(() => list.value.filter((r) => r.liveActive).length)
  const ephemeralCount = computed(() => list.value.filter((r) => r.isEphemeral).length)
  const disabledCount = computed(() => list.value.filter((r) => !r.enabled).length)

  function resetForm() {
    form.title = ''
    form.entryHint = '点击进入一起聊天'
    form.maxCapacity = 20
    form.sortOrder = 0
    form.backgroundUrl = ''
    form.password = ''
    form.clearPassword = false
    form.hasPassword = false
    form.enabled = true
  }

  async function load() {
    loading.value = true
    loadError.value = ''
    try {
      const res = await xhamilApi.getPublicVoiceRooms()
      list.value = res.list || []
    } catch (e: any) {
      loadError.value = e?.message || '加载失败'
    } finally {
      loading.value = false
    }
  }

  function openCreate() {
    editing.value = false
    editingId.value = 0
    resetForm()
    dialogOpen.value = true
  }

  function openEdit(row: PublicVoiceRoomItem) {
    editing.value = true
    editingId.value = row.id
    form.title = row.title || ''
    form.entryHint = row.entryHint || ''
    form.maxCapacity = row.maxCapacity || 20
    form.sortOrder = row.sortOrder || 0
    form.backgroundUrl = row.backgroundUrl || ''
    form.password = ''
    form.clearPassword = false
    form.hasPassword = !!row.hasPassword
    form.enabled = row.enabled !== false
    dialogOpen.value = true
  }

  async function save() {
    if (!form.title.trim()) return
    saving.value = true
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        entryHint: form.entryHint.trim(),
        maxCapacity: form.maxCapacity,
        sortOrder: form.sortOrder,
        enabled: form.enabled
      }
      if (form.backgroundUrl.trim()) body.backgroundUrl = form.backgroundUrl.trim()
      if (form.password.trim()) body.password = form.password.trim()
      if (form.clearPassword) body.clearPassword = true
      if (editing.value && editingId.value) {
        await xhamilApi.updatePublicVoiceRoom(editingId.value, body)
      } else {
        await xhamilApi.createPublicVoiceRoom(body)
      }
      dialogOpen.value = false
      await load()
    } finally {
      saving.value = false
    }
  }

  async function remove(id: number) {
    await xhamilApi.deletePublicVoiceRoom(id)
    await load()
  }

  onMounted(load)
</script>
