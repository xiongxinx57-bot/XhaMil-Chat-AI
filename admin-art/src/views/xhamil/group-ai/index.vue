<!-- 群 AI：Art Design Pro 表格布局 -->
<template>
  <div class="group-ai-page art-full-height">
    <ElCard class="art-table-card" shadow="never">
      <ArtTableHeader v-model:columns="columnChecks" :loading="loading" @refresh="load">
        <template #left>
          <ElSpace wrap>
            <ElButton type="primary" v-ripple @click="openCreate">新建 AI</ElButton>
            <span class="text-sm text-g-500"
              >{{ list.length }} 个 · {{ enabledCount }} 启用 · 仅 DeepSeek</span
            >
          </ElSpace>
        </template>
      </ArtTableHeader>

      <ArtTable :loading="loading" :data="list" :columns="columns" />
    </ElCard>

    <ElDialog
      v-model="formOpen"
      :title="editing ? '编辑 AI' : '新建群 AI'"
      width="520px"
      align-center
      destroy-on-close
      class="group-ai-dialog"
    >
      <ElForm label-position="top" size="small" class="group-ai-form">
        <ElFormItem label="名称" required>
          <ElInput v-model="form.name" maxlength="64" />
        </ElFormItem>
        <ElFormItem label="头像">
          <div class="flex items-center gap-3">
            <ElAvatar :size="40" :src="media(form.avatarUrl)" />
            <div>
              <input ref="fileRef" type="file" accept="image/*" hidden @change="onFile" />
              <ElButton size="small" @click="pickFile">上传</ElButton>
              <ElButton size="small" link type="danger" @click="form.avatarUrl = ''">移除</ElButton>
            </div>
          </div>
        </ElFormItem>
        <ElFormItem label="艾特名称">
          <ElInput v-model="form.mentionNames" placeholder="小助手,AI助手" />
        </ElFormItem>
        <ElFormItem label="接口">
          <ElInput model-value="DeepSeek 官方 · api.deepseek.com" disabled />
        </ElFormItem>
        <ElFormItem :label="editing ? 'API Key（留空保留）' : 'DeepSeek API Key'" :required="!editing">
          <ElInput v-model="form.apiKey" type="password" show-password autocomplete="new-password" />
          <div v-if="editing" class="text-xs text-g-400 mt-1">
            当前：{{ editing.apiKeyMasked || '未设置' }}
          </div>
          <div class="text-xs text-g-400 mt-1">在 platform.deepseek.com 申请</div>
        </ElFormItem>
        <ElFormItem label="模型" required>
          <ElSelect v-model="form.model" class="w-full">
            <ElOption
              v-for="m in deepseekModels"
              :key="m.id"
              :label="m.label"
              :value="m.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="人设（系统提示词）" required>
          <ElInput
            v-model="form.systemPrompt"
            type="textarea"
            :rows="6"
            placeholder="按 DeepSeek 官方写法写角色设定，例如：&#10;你是温柔的二次元少女小雪，说话带可爱语气词，喜欢关心别人，讨厌被当成机器人。"
          />
          <div class="text-xs text-g-400 mt-1">
            DeepSeek 无人设 ID；身份与口吻全部写在系统提示词中
          </div>
        </ElFormItem>
        <ElFormItem label="朗读音色">
          <div class="flex items-start gap-2 w-full">
            <ElSelect
              v-model="form.ttsVoiceId"
              class="flex-1 min-w-0"
              filterable
              clearable
              placeholder="搜索：萝莉 / 高冷女神 / 可莉 / 真实少女…"
            >
              <ElOptionGroup
                v-for="g in voiceGroups"
                :key="g.category"
                :label="g.category"
              >
                <ElOption
                  v-for="v in g.items"
                  :key="v.id"
                  :label="`${v.label}${v.desc ? ' · ' + v.desc : ''}`"
                  :value="v.id"
                >
                  <div class="flex flex-col leading-5 py-0.5">
                    <span>{{ v.label }}</span>
                    <span class="text-xs text-g-400">
                      {{ (v.tags || []).join(' · ') }}
                      <template v-if="v.id.startsWith('honkai:')"> · 崩坏3</template>
                      <template v-else-if="v.engine === 'genshin'"> · 原神</template>
                      <template v-else> · 真实神经音</template>
                    </span>
                  </div>
                </ElOption>
              </ElOptionGroup>
            </ElSelect>
            <ElButton
              :loading="previewingVoice"
              :disabled="!form.ttsVoiceId"
              @click="previewVoice"
            >
              {{ previewPlaying ? '播放中' : '试听' }}
            </ElButton>
          </div>
          <div class="text-xs text-g-400 mt-1 leading-5">
            选好后点「试听」听短句（角色声）。聊天里长文会自动用匹配风格神经音加速，一般数秒内出声
          </div>
        </ElFormItem>
        <ElFormItem label="仿人回复">
          <div class="flex flex-col gap-1">
            <ElSwitch v-model="form.humanlikeReply" />
            <div class="text-xs text-g-400 leading-5">
              开启后根据当前人设优化成真人聊天口吻，减少括号动作旁白、句句句号等「假」感
            </div>
          </div>
        </ElFormItem>
        <ElFormItem label="随机回复秒数">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2 flex-wrap">
              <ElInputNumber
                v-model="form.replyDelayMinSec"
                :min="0"
                :max="120"
                :step="1"
                controls-position="right"
              />
              <span class="text-g-500">~</span>
              <ElInputNumber
                v-model="form.replyDelayMaxSec"
                :min="0"
                :max="120"
                :step="1"
                controls-position="right"
              />
              <span class="text-g-500 text-sm">秒</span>
            </div>
            <div class="text-xs text-g-400 leading-5">
              群聊被艾特后在区间内随机等待再发出，避免秒回；填 0 ~ 0 为立即回复（后台测试聊天不受影响）
            </div>
          </div>
        </ElFormItem>
        <ElFormItem label="启用" class="!mb-0">
          <ElSwitch v-model="form.enabled" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="openTestFromForm">测试聊天</ElButton>
        <ElButton @click="formOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="assignOpen" :title="`群分配 · ${assignTarget?.name || ''}`" width="480px">
      <ElForm label-position="top">
        <ElFormItem label="群号">
          <ElInput v-model="groupCode" placeholder="仅数字" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton type="danger" plain :loading="assigning" @click="unassignByCode">
          按群号解除
        </ElButton>
        <ElButton type="primary" :loading="assigning" @click="assign">分配到群</ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="testOpen"
      :title="`测试聊天 · ${testTitle}`"
      width="560px"
      align-center
      destroy-on-close
      class="ai-test-dialog"
      @closed="resetTestChat"
    >
      <div class="ai-test-panel">
        <div ref="testListRef" class="ai-test-list">
          <div v-if="!testMessages.length" class="ai-test-empty">
            发送一条消息，验证接口与提示词是否正常
          </div>
          <div
            v-for="(m, idx) in testMessages"
            :key="idx"
            class="ai-test-row"
            :class="m.role === 'user' ? 'is-user' : 'is-bot'"
          >
            <div class="ai-test-bubble">{{ m.content }}</div>
          </div>
          <div v-if="testingChat" class="ai-test-row is-bot">
            <div class="ai-test-bubble is-loading">思考中…</div>
          </div>
        </div>
        <div class="ai-test-input">
          <ElInput
            v-model="testInput"
            type="textarea"
            :rows="2"
            maxlength="2000"
            placeholder="输入测试内容，Enter 发送（Shift+Enter 换行）"
            @keydown.enter.exact.prevent="sendTest"
          />
          <ElButton
            type="primary"
            :loading="testingChat"
            :disabled="!testInput.trim()"
            @click="sendTest"
          >
            发送
          </ElButton>
        </div>
      </div>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElAvatar, ElButton, ElInputNumber, ElMessage, ElMessageBox, ElTag } from 'element-plus'
  import { nextTick } from 'vue'
  import { useTableColumns } from '@/hooks/core/useTableColumns'
  import { xhamilApi } from '@/api/xhamil'

  defineOptions({ name: 'XhamilGroupAi' })

  type BotRow = Record<string, any>
  type ChatMsg = { role: 'user' | 'assistant'; content: string }

  const loading = ref(false)
  const saving = ref(false)
  const assigning = ref(false)
  const list = ref<BotRow[]>([])
  const formOpen = ref(false)
  const assignOpen = ref(false)
  const editing = ref<BotRow | null>(null)
  const assignTarget = ref<BotRow | null>(null)
  const groupCode = ref('')
  const fileRef = ref<HTMLInputElement | null>(null)
  const form = reactive({
    name: '',
    avatarUrl: '',
    mentionNames: '',
    apiKey: '',
    model: 'deepseek-v4-flash',
    systemPrompt: '',
    ttsVoiceId: 'genshin:可莉',
    humanlikeReply: true,
    replyDelayMinSec: 2,
    replyDelayMaxSec: 6,
    enabled: true
  })

  const voiceGroups = ref<Array<{ category: string; items: any[] }>>([])
  const previewingVoice = ref(false)
  const previewPlaying = ref(false)
  let previewAudio: HTMLAudioElement | null = null

  const deepseekModels = [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }
  ]

  const testOpen = ref(false)
  const testingChat = ref(false)
  const testInput = ref('')
  const testMessages = ref<ChatMsg[]>([])
  const testBotId = ref(0)
  const testDraft = ref<Record<string, unknown> | null>(null)
  const testTitle = ref('AI')
  const testListRef = ref<HTMLElement | null>(null)

  const enabledCount = computed(() => list.value.filter((b) => b.enabled).length)

  function media(url?: string) {
    if (!url) return ''
    if (/^https?:\/\//i.test(url)) return url
    return url.startsWith('/') ? url : `/${url}`
  }
  function mentions(row: BotRow) {
    return String(row.mentionNames || row.name || '')
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  function actionBtn(label: string, type: string, onClick: () => void) {
    return h(ElButton, { link: true, type: type as any, onClick }, () => label)
  }

  const { columns, columnChecks } = useTableColumns(() => [
    {
      prop: 'ai',
      label: 'AI',
      minWidth: 200,
      formatter: (row: BotRow) =>
        h('div', { class: 'flex items-center gap-2' }, [
          h(ElAvatar, { size: 36, src: media(row.avatarUrl) }, () => 'AI'),
          h('div', [
            h('div', { class: 'font-medium' }, row.name),
            h('div', { class: 'text-xs text-g-500' }, `${row.model || '—'} · ID ${row.id}`)
          ])
        ])
    },
    {
      prop: 'mentions',
      label: '艾特',
      minWidth: 140,
      formatter: (row: BotRow) => {
        const names = mentions(row)
        if (!names.length) return h('span', { class: 'text-g-400' }, '—')
        return h(
          'div',
          names.map((n) =>
            h(ElTag, { size: 'small', class: 'mr-1', key: n }, () => `@${n}`)
          )
        )
      }
    },
    {
      prop: 'ttsVoice',
      label: '音色',
      minWidth: 120,
      formatter: (row: BotRow) =>
        h('span', { class: 'text-sm' }, row.ttsVoiceLabel || row.ttsVoiceId || '—')
    },
    {
      prop: 'assignments',
      label: '已分配群',
      minWidth: 220,
      formatter: (row: BotRow) => {
        const items = row.assignments || []
        if (!items.length) return h('span', { class: 'text-g-400' }, '未分配')
        return h(
          'div',
          items.map((a: any) =>
            h('div', { class: 'mb-1', key: a.conversationId }, [
              h(ElTag, { size: 'small' }, () => a.groupTitle || a.groupCode),
              h('span', { class: 'text-xs text-g-500 ml-1' }, `群号 ${a.groupCode}`),
              actionBtn('解除', 'danger', () => unassign(row, a.conversationId))
            ])
          )
        )
      }
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 90,
      formatter: (row: BotRow) =>
        h(ElTag, { type: row.enabled ? 'success' : 'info', size: 'small' }, () =>
          row.enabled ? '启用' : '停用'
        )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 250,
      fixed: 'right',
      formatter: (row: BotRow) =>
        h('div', { class: 'flex flex-wrap items-center' }, [
          actionBtn('测试', 'success', () => openTest(row)),
          actionBtn('编辑', 'primary', () => openEdit(row)),
          actionBtn('群分配', 'primary', () => openAssign(row)),
          actionBtn('删除', 'danger', () => remove(row))
        ])
    }
  ])

  async function loadVoices() {
    try {
      const data = await xhamilApi.getAiBotVoices()
      voiceGroups.value = data?.groups || []
    } catch {
      voiceGroups.value = []
    }
  }

  function stopPreviewAudio() {
    if (!previewAudio) return
    try {
      previewAudio.pause()
      previewAudio.src = ''
    } catch {
      /* ignore */
    }
    previewAudio = null
    previewPlaying.value = false
  }

  async function previewVoice() {
    const voiceId = String(form.ttsVoiceId || '').trim()
    if (!voiceId) {
      ElMessage.warning('请先选择音色')
      return
    }
    stopPreviewAudio()
    previewingVoice.value = true
    try {
      const data = await xhamilApi.previewAiBotVoice({ voiceId })
      const url = media(data?.audioUrl)
      if (!url) throw new Error('无音频')
      const audio = new Audio(url)
      previewAudio = audio
      audio.onended = () => {
        previewPlaying.value = false
      }
      audio.onerror = () => {
        previewPlaying.value = false
        ElMessage.error('音频播放失败')
      }
      previewPlaying.value = true
      await audio.play()
      if (data?.engine === 'genshin' && data?.label) {
        ElMessage.success(`正在试听：${data.label}`)
      }
    } catch (e: any) {
      previewPlaying.value = false
      ElMessage.error(e?.message || '试听失败，请稍后再试')
    } finally {
      previewingVoice.value = false
    }
  }

  async function load() {
    loading.value = true
    try {
      const data = await xhamilApi.getAiBots()
      list.value = data?.list || []
    } finally {
      loading.value = false
    }
  }

  function openCreate() {
    editing.value = null
    Object.assign(form, {
      name: '',
      avatarUrl: '',
      mentionNames: '',
      apiKey: '',
      model: 'deepseek-v4-flash',
      systemPrompt: '',
      ttsVoiceId: 'genshin:可莉',
      humanlikeReply: true,
      replyDelayMinSec: 2,
      replyDelayMaxSec: 6,
      enabled: true
    })
    formOpen.value = true
  }

  function openEdit(row: BotRow) {
    editing.value = row
    const model = String(row.model || '')
    Object.assign(form, {
      name: row.name || '',
      avatarUrl: row.avatarUrl || '',
      mentionNames: row.mentionNames || '',
      apiKey: '',
      model: deepseekModels.some((m) => m.id === model) ? model : 'deepseek-v4-flash',
      systemPrompt: row.systemPrompt || '',
      ttsVoiceId: row.ttsVoiceId || 'genshin:可莉',
      humanlikeReply: row.humanlikeReply !== false,
      replyDelayMinSec: Number(row.replyDelayMinSec ?? 2) || 0,
      replyDelayMaxSec: Number(row.replyDelayMaxSec ?? 6) || 0,
      enabled: !!row.enabled
    })
    formOpen.value = true
  }

  function pickFile() {
    fileRef.value?.click()
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const res = await xhamilApi.uploadAvatar(file)
    form.avatarUrl = res.avatarUrl
  }

  async function save() {
    if (!form.name.trim()) {
      ElMessage.error('请填写名称')
      return
    }
    if (!form.systemPrompt.trim()) {
      ElMessage.error('请填写人设（系统提示词）')
      return
    }
    if (!editing.value && !form.apiKey) {
      ElMessage.error('请填写 DeepSeek API Key')
      return
    }
    saving.value = true
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        avatarUrl: form.avatarUrl,
        mentionNames: form.mentionNames,
        model: form.model,
        systemPrompt: form.systemPrompt,
        ttsVoiceId: form.ttsVoiceId || 'genshin:可莉',
        humanlikeReply: form.humanlikeReply,
        replyDelayMinSec: form.replyDelayMinSec,
        replyDelayMaxSec: form.replyDelayMaxSec,
        enabled: form.enabled,
        apiBaseUrl: 'https://api.deepseek.com'
      }
      if (form.apiKey) body.apiKey = form.apiKey
      if (editing.value) {
        await xhamilApi.updateAiBot(editing.value.id, body)
      } else {
        await xhamilApi.createAiBot(body)
      }
      formOpen.value = false
      await load()
    } finally {
      saving.value = false
    }
  }

  function openAssign(row: BotRow) {
    assignTarget.value = row
    groupCode.value = ''
    assignOpen.value = true
  }

  async function assign() {
    const code = groupCode.value.trim()
    if (!/^\d+$/.test(code)) {
      ElMessage.error('群号须为数字')
      return
    }
    const taken = list.value.some((b) =>
      (b.assignments || []).some((a: any) => String(a.groupCode) === code)
    )
    if (taken) {
      ElMessage.warning('此群已被分配 AI 了')
      return
    }
    assigning.value = true
    try {
      await xhamilApi.assignAiBot(assignTarget.value!.id, code)
      assignOpen.value = false
      await load()
    } finally {
      assigning.value = false
    }
  }

  async function unassignByCode() {
    const code = groupCode.value.trim()
    if (!/^\d+$/.test(code)) {
      ElMessage.error('群号须为数字')
      return
    }
    assigning.value = true
    try {
      await xhamilApi.unassignAiBotByCode(assignTarget.value!.id, code)
      await load()
    } finally {
      assigning.value = false
    }
  }

  async function unassign(row: BotRow, cid: number) {
    await xhamilApi.unassignAiBot(row.id, cid)
    await load()
  }

  async function remove(row: BotRow) {
    await ElMessageBox.confirm(`删除「${row.name}」？`, '删除群 AI', { type: 'warning' })
    await xhamilApi.deleteAiBot(row.id)
    await load()
  }

  function resetTestChat() {
    testMessages.value = []
    testInput.value = ''
    testingChat.value = false
    testBotId.value = 0
    testDraft.value = null
  }

  function openTest(row: BotRow) {
    resetTestChat()
    testBotId.value = Number(row.id) || 0
    testTitle.value = row.name || 'AI'
    testDraft.value = null
    testOpen.value = true
  }

  function openTestFromForm() {
    if (!form.systemPrompt.trim()) {
      ElMessage.error('请先填写人设（系统提示词）')
      return
    }
    if (!editing.value && !form.apiKey.trim()) {
      ElMessage.error('请先填写 DeepSeek API Key')
      return
    }
    resetTestChat()
    testBotId.value = Number(editing.value?.id) || 0
    testTitle.value = form.name.trim() || editing.value?.name || '草稿配置'
    testDraft.value = {
      name: form.name,
      apiKey: form.apiKey,
      model: form.model,
      systemPrompt: form.systemPrompt,
      humanlikeReply: form.humanlikeReply
    }
    testOpen.value = true
  }

  async function scrollTestBottom() {
    await nextTick()
    const el = testListRef.value
    if (el) el.scrollTop = el.scrollHeight
  }

  async function sendTest() {
    const text = testInput.value.trim()
    if (!text || testingChat.value) return
    testMessages.value.push({ role: 'user', content: text })
    testInput.value = ''
    await scrollTestBottom()
    testingChat.value = true
    try {
      const history = testMessages.value.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content
      }))
      const res = await xhamilApi.testAiBotChat({
        botId: testBotId.value || undefined,
        message: text,
        history,
        draft: testDraft.value || undefined
      })
      testMessages.value.push({
        role: 'assistant',
        content: res?.reply || '（无回复）'
      })
    } catch {
      testMessages.value.pop()
      testInput.value = text
    } finally {
      testingChat.value = false
      await scrollTestBottom()
    }
  }

  onMounted(() => {
    loadVoices()
    load()
  })

  watch(formOpen, (open) => {
    if (!open) stopPreviewAudio()
  })

  onBeforeUnmount(() => {
    stopPreviewAudio()
  })
</script>

<style scoped>
  .group-ai-form :deep(.el-form-item) {
    margin-bottom: 12px;
  }

  .ai-test-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ai-test-list {
    height: 360px;
    overflow: auto;
    padding: 12px;
    background: #f5f7fb;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
  }

  .ai-test-empty {
    padding: 48px 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    text-align: center;
  }

  .ai-test-row {
    display: flex;
    margin-bottom: 10px;
  }

  .ai-test-row.is-user {
    justify-content: flex-end;
  }

  .ai-test-row.is-bot {
    justify-content: flex-start;
  }

  .ai-test-bubble {
    max-width: 82%;
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    border-radius: 12px;
  }

  .is-user .ai-test-bubble {
    color: #fff;
    background: var(--el-color-primary);
    border-bottom-right-radius: 4px;
  }

  .is-bot .ai-test-bubble {
    color: var(--el-text-color-primary);
    background: #fff;
    border: 1px solid var(--el-border-color-lighter);
    border-bottom-left-radius: 4px;
  }

  .ai-test-bubble.is-loading {
    color: var(--el-text-color-secondary);
  }

  .ai-test-input {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: end;
  }
</style>

<style>
  .group-ai-dialog .el-dialog__body {
    max-height: min(68vh, 520px);
    overflow-y: auto;
    padding-top: 8px;
    padding-bottom: 4px;
  }

  .ai-test-dialog .el-dialog__body {
    padding-top: 8px;
  }
</style>
