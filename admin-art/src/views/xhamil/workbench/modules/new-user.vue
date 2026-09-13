<!-- 新用户：布局对齐 Art，数据来自用户表 -->
<template>
  <div class="art-card p-5 h-128 overflow-hidden mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>新用户</h4>
        <p>
          今日新增
          <span class="text-success">+{{ todayUsers }}</span>
        </p>
      </div>
      <ElRadioGroup v-model="range">
        <ElRadioButton value="month" label="本月" />
        <ElRadioButton value="lastMonth" label="上月" />
        <ElRadioButton value="year" label="今年" />
      </ElRadioGroup>
    </div>

    <ArtTable
      class="w-full"
      :data="tableData"
      :loading="loading"
      size="large"
      :border="false"
      :stripe="false"
      :header-cell-style="{ background: 'transparent' }"
    >
      <template #default>
        <ElTableColumn label="用户" min-width="160">
          <template #default="{ row }">
            <div class="flex items-center">
              <XhamilAvatar
                :src="row.avatarUrl"
                :uid="row.id"
                :size="36"
                img-class="rounded-lg object-cover bg-g-200"
              />
              <div class="ml-2 min-w-0">
                <div class="truncate">{{ row.nickname || row.username || '—' }}</div>
                <div class="text-xs text-g-500 truncate">@{{ row.username }}</div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="聊聊号" prop="chatNo" width="100" />
        <ElTableColumn label="状态" width="90">
          <template #default="{ row }">
            <ElTag :type="isBanned(row) ? 'danger' : 'success'" size="small">
              {{ isBanned(row) ? '封禁' : '正常' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="资料完整度" min-width="160">
          <template #default="{ row }">
            <ElProgress
              :percentage="row.pro"
              :color="row.color"
              :stroke-width="4"
              :aria-label="`${row.nickname || row.username} 资料完整度 ${row.pro}%`"
            />
          </template>
        </ElTableColumn>
      </template>
    </ArtTable>
  </div>
</template>

<script setup lang="ts">
  import { xhamilApi } from '@/api/xhamil'
  import XhamilAvatar from '@/components/xhamil/XhamilAvatar.vue'

  defineOptions({ name: 'WorkbenchNewUser' })

  const props = defineProps<{
    todayUsers?: number
  }>()

  const COLORS = [
    'var(--art-primary)',
    'var(--art-secondary)',
    'var(--art-warning)',
    'var(--art-info)',
    'var(--art-error)',
    'var(--art-success)'
  ]

  const loading = ref(false)
  const range = ref<'month' | 'lastMonth' | 'year'>('month')
  const rawList = ref<any[]>([])
  const tableData = ref<any[]>([])

  function isBanned(row: any) {
    return row.status === 'banned' || !!row.banned || !!row.isBanned
  }

  function profileScore(u: any) {
    let score = 30
    if (u.nickname) score += 20
    if (u.avatarUrl || u.avatar) score += 20
    if (u.email) score += 15
    if (u.chatNo) score += 15
    return Math.min(100, score)
  }

  function inRange(createdAt?: string) {
    if (!createdAt) return range.value === 'year'
    const d = new Date(createdAt)
    if (Number.isNaN(d.getTime())) return true
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    if (range.value === 'year') return d.getFullYear() === y
    if (range.value === 'month') return d.getFullYear() === y && d.getMonth() === m
    const last = new Date(y, m - 1, 1)
    return d.getFullYear() === last.getFullYear() && d.getMonth() === last.getMonth()
  }

  function rebuild() {
    const filtered = rawList.value
      .filter((u) => inRange(u.joined || u.createdAt))
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, 8)
      .map((u, i) => {
        const percentage = profileScore(u)
        return {
          ...u,
          percentage,
          pro: 0,
          color: COLORS[i % COLORS.length]
        }
      })
    tableData.value = filtered
    nextTick(() => {
      setTimeout(() => {
        tableData.value.forEach((item) => {
          item.pro = item.percentage
        })
      }, 100)
    })
  }

  async function load() {
    loading.value = true
    try {
      const data = await xhamilApi.getUsers()
      rawList.value = data?.list || []
      rebuild()
    } finally {
      loading.value = false
    }
  }

  watch(range, rebuild)
  onMounted(load)
</script>

<style lang="scss" scoped>
  .art-card {
    :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
      color: var(--el-color-primary) !important;
      background: transparent !important;
    }
  }
</style>
