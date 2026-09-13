<!-- 你画我猜 · 对齐现网：加分规则 + 状态卡 + 选词风格 + 词库/开放群 -->
<template>
  <div class="draw-guess-page" v-loading="loading">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">你画我猜</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">选词风格、词库分类与开放群聊</p>
      </div>
      <ElSpace wrap>
        <ElButton :loading="loading" v-ripple @click="load">
          <ArtSvgIcon icon="ri:refresh-line" class="mr-1" />
          重置
        </ElButton>
        <ElButton type="primary" :loading="saving" v-ripple @click="save">
          <ArtSvgIcon icon="ri:save-line" class="mr-1" />
          保存选词配置
        </ElButton>
      </ElSpace>
    </div>

    <!-- 加分规则 -->
    <div class="art-card p-5 mb-4">
      <h3 class="text-base font-medium m-0 mb-4">加分规则</h3>
      <div class="rules-grid">
        <div v-for="section in scoringSections" :key="section.title" class="rule-block">
          <p class="rule-title">{{ section.title }}</p>
          <ul>
            <li v-for="item in section.items" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 状态概览 -->
    <ElRow :gutter="14" class="mb-4">
      <ElCol :xs="24" :sm="8" class="mb-3 sm:mb-0">
        <div class="art-card stat-card">
          <p class="stat-label">功能状态</p>
          <div class="flex items-center justify-between gap-3">
            <ElTag :type="form.enabled ? 'success' : 'info'" effect="plain">
              {{ form.enabled ? '已启用' : '未启用' }}
            </ElTag>
            <ElSwitch v-model="form.enabled" />
          </div>
        </div>
      </ElCol>
      <ElCol :xs="24" :sm="8" class="mb-3 sm:mb-0">
        <div class="art-card stat-card">
          <p class="stat-label">分类 / 词语</p>
          <h3 class="stat-value">{{ categories.length }} / {{ wordCount }}</h3>
        </div>
      </ElCol>
      <ElCol :xs="24" :sm="8">
        <div class="art-card stat-card">
          <p class="stat-label">已开放群聊</p>
          <h3 class="stat-value">{{ assignedGroups.length }}</h3>
        </div>
      </ElCol>
    </ElRow>

    <ElRow :gutter="14">
      <!-- 左：选词与风格 + 分配群 -->
      <ElCol :xs="24" :lg="12" class="mb-4">
        <div ref="leftCardRef" class="art-card p-5">
          <h3 class="text-base font-medium m-0 mb-4">选词与风格</h3>
          <ElForm label-position="top">
            <ElFormItem label="风格名称" required>
              <ElInput v-model="form.styleName" maxlength="32" placeholder="例如：经典题材" />
            </ElFormItem>
            <ElFormItem label="每轮选词数量" required>
              <ElInputNumber v-model="form.optionCount" :min="4" :max="8" class="w-full!" />
            </ElFormItem>
          </ElForm>

          <p class="preset-hint">风格预设 · 点击加载整包词库</p>
          <div class="preset-grid">
            <div
              v-for="preset in presets"
              :key="preset.id"
              class="preset-item"
              :class="{
                'is-active': activePresetId === preset.id,
                'is-wide': preset.id === 'all-in-one'
              }"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium">{{ preset.name }}</span>
                  <ElTag v-if="activePresetId === preset.id" size="small" effect="plain">当前</ElTag>
                  <ElTag v-if="preset.id === 'all-in-one'" type="primary" size="small" effect="plain">
                    推荐
                  </ElTag>
                </div>
                <div class="text-xs text-g-500 mt-1 truncate">
                  {{ preset.desc }} · {{ Object.keys(preset.wordBank).length }} 类 ·
                  {{ presetWordCount(preset) }} 词
                </div>
              </div>
              <ElButton
                size="small"
                :type="activePresetId === preset.id ? 'primary' : 'default'"
                @click="loadPreset(preset.id)"
              >
                {{ activePresetId === preset.id ? '重新加载' : '加载' }}
              </ElButton>
            </div>
          </div>

          <div class="assign-block">
            <p class="assign-title">
              <ArtSvgIcon icon="ri:group-line" />
              分配开放群聊
            </p>
            <p class="text-xs text-g-500 mb-3">仅已分配的群可在加号菜单中发起你画我猜</p>
            <div class="flex gap-2">
              <ElInput
                v-model="groupCode"
                placeholder="请输入数字群号"
                maxlength="20"
                @input="onGroupCodeInput"
                @keyup.enter="assignGroup"
              />
              <ElButton type="primary" :loading="assigning" @click="assignGroup">分配</ElButton>
            </div>
          </div>
        </div>
      </ElCol>

      <!-- 右：词库 + 已开放群 -->
      <ElCol :xs="24" :lg="12" class="mb-4">
        <div class="art-card p-5 mb-3">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-base font-medium m-0">词库分类</h3>
            <ElButton size="small" @click="addCategory">
              <ArtSvgIcon icon="ri:add-line" class="mr-1" />
              添加分类
            </ElButton>
          </div>
          <div
            class="scroll-box"
            :class="{ 'is-empty': !categories.length }"
            :style="{ height: `${categoryListHeight}px` }"
          >
            <template v-if="categories.length">
              <div v-for="item in categories" :key="item.key" class="category-row">
                <div class="flex items-center gap-2 mb-2">
                  <ElInput
                    v-model="item.name"
                    maxlength="20"
                    placeholder="分类名"
                    style="width: 140px"
                  />
                  <ElButton link type="danger" @click="removeCategory(item.key)">
                    <ArtSvgIcon icon="ri:delete-bin-line" />
                  </ElButton>
                </div>
                <ElInput
                  v-model="item.wordsText"
                  type="textarea"
                  :rows="3"
                  placeholder="每行一个词"
                />
              </div>
            </template>
            <ElEmpty v-else description="暂无分类" :image-size="64" />
          </div>
        </div>

        <div class="art-card p-5">
          <h3 class="text-base font-medium m-0 mb-3">已开放群聊 ({{ assignedGroups.length }})</h3>
          <div
            class="scroll-box"
            :class="{ 'is-empty': !assignedGroups.length }"
            :style="{ height: `${groupListHeight}px` }"
          >
            <template v-if="assignedGroups.length">
              <div
                v-for="g in assignedGroups"
                :key="g.conversationId"
                class="group-row"
              >
                <div class="min-w-0">
                  <div class="text-sm font-medium truncate">{{ g.groupTitle || '未命名群' }}</div>
                  <div class="text-xs text-g-500">群号 {{ g.groupCode || '—' }}</div>
                </div>
                <ElButton link type="danger" @click="unassignGroup(g)">
                  <ArtSvgIcon icon="ri:delete-bin-line" />
                </ElButton>
              </div>
            </template>
            <ElEmpty v-else description="暂未分配群聊" :image-size="64" />
          </div>
        </div>
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { xhamilApi } from '@/api/xhamil'
  import { DRAW_GUESS_SCORING_SECTIONS } from '@/data/drawGuessScoringRules'
  import {
    DRAW_GUESS_WORD_PRESETS,
    applyDrawGuessPreset,
    categoriesToWordBank,
    wordBankToCategories,
    type DrawGuessWordPreset
  } from '@/data/drawGuessWordPresets'

  defineOptions({ name: 'XhamilDrawGuess' })

  type CategoryRow = { key: string; name: string; wordsText: string }
  type AssignedGroup = {
    conversationId: number
    groupCode: string
    groupTitle: string
  }

  const loading = ref(false)
  const saving = ref(false)
  const assigning = ref(false)
  const groupCode = ref('')
  const activePresetId = ref('classic')
  const categories = ref<CategoryRow[]>([])
  const assignedGroups = ref<AssignedGroup[]>([])
  const leftCardRef = ref<HTMLElement | null>(null)
  const listHeight = ref(360)

  const scoringSections = DRAW_GUESS_SCORING_SECTIONS
  const presets = DRAW_GUESS_WORD_PRESETS

  const form = reactive({
    enabled: false,
    styleName: '',
    optionCount: 4
  })

  const wordCount = computed(() =>
    categories.value.reduce((sum, item) => {
      const n = String(item.wordsText || '')
        .split(/\r?\n/)
        .map((w) => w.trim())
        .filter(Boolean).length
      return sum + n
    }, 0)
  )

  const categoryListHeight = computed(() => Math.max(220, Math.floor(listHeight.value * 0.58)))
  const groupListHeight = computed(() => Math.max(160, Math.floor(listHeight.value * 0.34)))

  function presetWordCount(preset: DrawGuessWordPreset) {
    return Object.values(preset.wordBank).reduce((sum, words) => sum + words.length, 0)
  }

  function sanitizeDigits(v: string) {
    return String(v || '').replace(/\D/g, '')
  }

  function onGroupCodeInput(val: string) {
    groupCode.value = sanitizeDigits(val)
  }

  function syncListHeight() {
    const el = leftCardRef.value
    if (el && el.offsetHeight > 0) listHeight.value = el.offsetHeight
  }

  function applyRes(res: any) {
    form.enabled = !!res?.enabled
    form.styleName = res?.styleName || ''
    form.optionCount = Math.min(8, Math.max(4, Number(res?.optionCount) || 4))
    activePresetId.value = res?.activePresetId || 'classic'
    categories.value = wordBankToCategories(res?.wordBank || {})
    assignedGroups.value = res?.assignedGroups || []
  }

  async function load() {
    loading.value = true
    try {
      applyRes(await xhamilApi.getDrawGuessConfig())
    } finally {
      loading.value = false
      nextTick(syncListHeight)
    }
  }

  function loadPreset(presetId: string) {
    const preset = applyDrawGuessPreset(presetId)
    if (!preset) return
    categories.value = wordBankToCategories(preset.wordBank)
    activePresetId.value = preset.activePresetId
    form.styleName = preset.styleName
    const name = DRAW_GUESS_WORD_PRESETS.find((p) => p.id === presetId)?.name || presetId
    ElMessage.success(`已加载「${name}」`)
    nextTick(syncListHeight)
  }

  function addCategory() {
    categories.value.push({
      key: `new-${Date.now()}`,
      name: '新分类',
      wordsText: '词语一\n词语二\n词语三'
    })
  }

  function removeCategory(key: string) {
    categories.value = categories.value.filter((c) => c.key !== key)
  }

  async function save() {
    if (!String(form.styleName || '').trim()) {
      ElMessage.warning('请输入风格名称')
      return
    }
    const wordBank = categoriesToWordBank(categories.value)
    if (!Object.keys(wordBank).length) {
      ElMessage.warning('请至少保留一个有效分类，且每个分类不少于 2 个词')
      return
    }
    saving.value = true
    try {
      const res = await xhamilApi.setDrawGuessConfig({
        enabled: form.enabled,
        styleName: form.styleName,
        optionCount: form.optionCount,
        activePresetId: activePresetId.value,
        wordBank
      })
      applyRes(res)
      ElMessage.success('已保存')
    } finally {
      saving.value = false
    }
  }

  async function assignGroup() {
    const code = groupCode.value.trim()
    if (!code) {
      ElMessage.warning('请输入群号')
      return
    }
    if (!/^\d+$/.test(code)) {
      ElMessage.warning('群号须为数字')
      return
    }
    assigning.value = true
    try {
      const res = await xhamilApi.assignDrawGuessGroup(code)
      assignedGroups.value = res?.assignedGroups || []
      groupCode.value = ''
      ElMessage.success(res?.message || '分配成功')
      nextTick(syncListHeight)
    } finally {
      assigning.value = false
    }
  }

  async function unassignGroup(item: AssignedGroup) {
    const res = await xhamilApi.unassignDrawGuessGroup({ conversationId: item.conversationId })
    assignedGroups.value = res?.assignedGroups || []
    ElMessage.success(res?.message || '已取消开放')
  }

  let resizeObserver: ResizeObserver | null = null

  onMounted(async () => {
    await load()
    nextTick(() => {
      syncListHeight()
      if (leftCardRef.value) {
        resizeObserver = new ResizeObserver(() => syncListHeight())
        resizeObserver.observe(leftCardRef.value)
      }
    })
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })
</script>

<style scoped lang="scss">
  .rules-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  @media (max-width: 1200px) {
    .rules-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .rules-grid {
      grid-template-columns: 1fr;
    }
  }

  .rule-block {
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-fill-color-lighter);

    ul {
      margin: 0;
      padding-left: 16px;
      font-size: 13px;
      line-height: 1.7;
      color: var(--el-text-color-regular);
    }
  }

  .rule-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .stat-card {
    height: 100%;
    padding: 18px 20px;
  }

  .stat-label {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }

  .stat-value {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--el-text-color-primary);
    line-height: 1.2;
  }

  .preset-hint {
    margin: 4px 0 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  @media (max-width: 640px) {
    .preset-grid {
      grid-template-columns: 1fr;
    }
  }

  .preset-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid var(--el-border-color-lighter);
    background: var(--el-fill-color-lighter);

    &.is-active {
      border-color: var(--el-text-color-primary);
      background: var(--el-fill-color);
    }

    &.is-wide {
      grid-column: 1 / -1;
    }
  }

  .assign-block {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  .assign-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  .scroll-box {
    overflow-y: auto;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    background: var(--el-bg-color);

    &.is-empty {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  .category-row {
    padding: 12px;
    border-bottom: 1px solid var(--el-border-color-extra-light);

    &:last-child {
      border-bottom: none;
    }
  }

  .group-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--el-border-color-extra-light);

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: var(--el-fill-color-lighter);
    }
  }
</style>
