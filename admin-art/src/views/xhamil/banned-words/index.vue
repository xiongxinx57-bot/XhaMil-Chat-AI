<!-- 违禁词配置：对齐现网完整预设方案 -->
<template>
  <div class="banned-words-page">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">违禁词</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">
          消息过滤 · 当前 {{ words.length }} 个词
          <span v-if="activePreset"> · 预设「{{ activePreset.name }}」</span>
        </p>
      </div>
      <ElSpace wrap>
        <ElButton :loading="loading" v-ripple @click="load">刷新</ElButton>
        <ElButton type="primary" :loading="saving" v-ripple @click="save">保存</ElButton>
      </ElSpace>
    </div>

    <ElRow :gutter="16" v-loading="loading">
      <ElCol :md="8" :xs="24" class="mb-4">
        <div class="art-card p-5 mb-4">
          <h3 class="text-base font-medium m-0 mb-4">基础设置</h3>
          <ElForm label-position="top">
            <ElFormItem label="启用过滤">
              <ElSwitch v-model="enabled" />
            </ElFormItem>
            <ElFormItem label="掩码字符" class="!mb-0">
              <ElInput v-model="maskChar" maxlength="4" placeholder="*" style="max-width: 120px" />
            </ElFormItem>
          </ElForm>
        </div>

        <div class="art-card p-5">
          <h3 class="text-base font-medium m-0 mb-1">预设方案</h3>
          <p class="text-xs text-g-500 mt-0 mb-3">
            切换时会移除上一预设的词，手动添加的会保留
          </p>
          <div class="preset-grid">
            <div
              v-for="preset in BANNED_WORD_PRESETS"
              :key="preset.id"
              class="preset-item"
              :class="{
                active: activePresetId === preset.id,
                wide: preset.id === 'all-in-one'
              }"
              role="button"
              tabindex="0"
              @click="loadPreset(preset.id)"
              @keyup.enter="loadPreset(preset.id)"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-g-900">{{ preset.name }}</span>
                  <ElTag v-if="activePresetId === preset.id" size="small" type="info">当前</ElTag>
                </div>
                <div class="text-xs text-g-500 mt-1 truncate">
                  {{ preset.desc }} · {{ preset.words.length }} 个词
                </div>
              </div>
              <ElButton
                size="small"
                :type="activePresetId === preset.id ? 'primary' : 'default'"
                @click.stop="loadPreset(preset.id)"
              >
                {{ activePresetId === preset.id ? '重新加载' : '切换' }}
              </ElButton>
            </div>
          </div>
          <ElButton class="mt-3" size="small" type="danger" plain @click="clearWords">
            清空词库
          </ElButton>
        </div>
      </ElCol>

      <ElCol :md="16" :xs="24" class="mb-4">
        <div class="art-card p-5">
          <h3 class="text-base font-medium m-0 mb-4">词库</h3>
          <div class="flex gap-2 mb-3">
            <ElInput
              v-model="draft"
              maxlength="32"
              placeholder="输入违禁词后回车添加"
              @keyup.enter="addWord"
            />
            <ElButton type="primary" @click="addWord">添加</ElButton>
          </div>

          <div class="tags-wrap mb-4">
            <ElTag
              v-for="w in words"
              :key="w"
              class="m-1"
              closable
              @close="removeWord(w)"
            >
              {{ w }}
            </ElTag>
            <p v-if="!words.length" class="text-sm text-g-500 m-0 py-2">暂无违禁词</p>
          </div>

          <ElFormItem label="批量编辑（每行一个）">
            <ElInput
              v-model="bulkText"
              type="textarea"
              :rows="10"
              placeholder="可粘贴多行违禁词，失焦后同步到上方标签"
              @blur="syncFromBulk"
            />
          </ElFormItem>
          <ElButton size="small" @click="syncFromBulk">从文本同步</ElButton>
        </div>
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'
  import {
    BANNED_WORD_PRESETS,
    switchBannedWordsPreset,
    collectAllBannedPresetWords,
    type BannedWordPreset
  } from '@/data/bannedWordPresets'

  defineOptions({ name: 'XhamilBannedWords' })

  const loading = ref(false)
  const saving = ref(false)
  const enabled = ref(false)
  const maskChar = ref('*')
  const words = ref<string[]>([])
  const draft = ref('')
  const bulkText = ref('')
  const activePresetId = ref<string | null>(null)

  const activePreset = computed(
    () => BANNED_WORD_PRESETS.find((p) => p.id === activePresetId.value) || null
  )

  function parseWords(text: string) {
    return String(text || '')
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter(Boolean)
  }

  function uniqueWords(list: string[]) {
    const seen = new Set<string>()
    const out: string[] = []
    for (const w of list) {
      const key = w.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(w)
    }
    return out
  }

  watch(
    words,
    (list) => {
      bulkText.value = list.join('\n')
    },
    { deep: true }
  )

  async function load() {
    loading.value = true
    try {
      const res = await xhamilApi.getBannedWordsConfig()
      enabled.value = !!res?.enabled
      maskChar.value = res?.maskChar || '*'
      words.value = parseWords(res?.wordsText || '')
      const savedId = String(res?.activePresetId || '').trim()
      activePresetId.value = BANNED_WORD_PRESETS.some((p) => p.id === savedId) ? savedId : null
    } finally {
      loading.value = false
    }
  }

  function addWord() {
    const value = draft.value.trim()
    if (!value) {
      ElMessage.warning('请输入违禁词')
      return
    }
    if (value.length > 32) {
      ElMessage.warning('单个违禁词最多 32 字')
      return
    }
    if (words.value.some((w) => w.toLowerCase() === value.toLowerCase())) {
      ElMessage.warning('该违禁词已存在')
      return
    }
    words.value = [...words.value, value]
    draft.value = ''
  }

  function removeWord(target: string) {
    words.value = words.value.filter((w) => w !== target)
  }

  function syncFromBulk() {
    words.value = uniqueWords(parseWords(bulkText.value))
  }

  function loadPreset(id: string) {
    const preset = BANNED_WORD_PRESETS.find((p) => p.id === id)
    if (!preset) return

    const previous: BannedWordPreset | undefined = activePresetId.value
      ? BANNED_WORD_PRESETS.find((p) => p.id === activePresetId.value)
      : undefined

    words.value = switchBannedWordsPreset(
      words.value,
      previous?.words ?? null,
      preset.words,
      previous ? null : collectAllBannedPresetWords()
    )
    activePresetId.value = id

    if (previous && previous.id !== id) {
      ElMessage.success(`已切换至「${preset.name}」，已移除上一预设的词`)
    } else if (!previous) {
      ElMessage.success(`已切换至「${preset.name}」，已替换预设词（手动添加的会保留）`)
    } else {
      ElMessage.success(`已加载「${preset.name}」`)
    }
  }

  async function clearWords() {
    await ElMessageBox.confirm('确定清空当前词库？', '清空词库', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
    words.value = []
    activePresetId.value = null
  }

  async function save() {
    saving.value = true
    try {
      const res = await xhamilApi.setBannedWordsConfig({
        enabled: enabled.value,
        maskChar: maskChar.value || '*',
        wordsText: words.value.join('\n'),
        activePresetId: activePresetId.value
      })
      words.value = parseWords(res?.wordsText || '')
      enabled.value = !!res?.enabled
      maskChar.value = res?.maskChar || '*'
      const savedId = String(res?.activePresetId || '').trim()
      activePresetId.value = BANNED_WORD_PRESETS.some((p) => p.id === savedId) ? savedId : null
      ElMessage.success('已保存')
    } finally {
      saving.value = false
    }
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .preset-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .preset-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-fill-color-blank);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .preset-item:hover {
    border-color: var(--el-color-primary-light-5);
  }

  .preset-item.active {
    border-color: var(--el-color-primary-light-5);
    background: var(--el-color-primary-light-9);
  }

  .preset-item.wide {
    border-style: dashed;
  }

  .tags-wrap {
    min-height: 120px;
    max-height: 320px;
    overflow: auto;
    padding: 8px;
    border-radius: 8px;
    background: var(--el-fill-color-lighter);
  }
</style>
