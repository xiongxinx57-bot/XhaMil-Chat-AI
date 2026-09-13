<!-- 数据库浏览 · 中文表名/字段说明 -->
<template>
  <div class="database-browse-page">
    <div class="mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-lg font-medium m-0 text-g-900">表数据预览</h2>
        <p class="text-sm text-g-500 mt-1 mb-0">
          {{ meta?.database ? `库：${meta.database}` : '查看业务表数据' }}
        </p>
      </div>
      <ElButton :loading="metaLoading || rowsLoading" v-ripple @click="refreshAll">刷新</ElButton>
    </div>

    <div v-if="dbDisconnected" class="art-card p-10 text-center mb-4">
      <ElEmpty description="数据库未连接">
        <p class="text-sm text-g-500 mb-4">请先在数据库配置中完成 MySQL 连接</p>
        <ElButton type="primary" @click="goDatabase">去配置</ElButton>
      </ElEmpty>
    </div>

    <ElRow v-else :gutter="16">
      <ElCol :md="6" :xs="24" class="mb-4">
        <div class="art-card p-4 h-full">
          <div class="mb-3">
            <ElInput v-model="filter" clearable placeholder="搜索表名或中文说明…" size="small" />
          </div>
          <div v-loading="metaLoading" class="table-list">
            <button
              v-for="t in filteredTables"
              :key="t.name"
              type="button"
              class="table-item"
              :class="{ active: selected === t.name, disabled: !t.exists }"
              :disabled="!t.exists"
              @click="selectTable(t.name)"
            >
              <span class="min-w-0">
                <span class="block truncate">{{ t.name }}</span>
                <span v-if="tableLabel(t.name, t.desc)" class="block text-xs text-g-500 truncate mt-0.5">
                  {{ tableLabel(t.name, t.desc) }}
                </span>
              </span>
              <ElTag v-if="!t.exists" size="small" type="info">未创建</ElTag>
            </button>
            <p v-if="!filteredTables.length" class="text-sm text-g-500 m-0 py-4 text-center">
              暂无表
            </p>
          </div>
        </div>
      </ElCol>

      <ElCol :md="18" :xs="24" class="mb-4">
        <div class="art-card p-4">
          <div class="mb-3 flex items-center justify-between flex-wrap gap-2">
            <h3 class="text-base font-medium m-0">
              {{ selected || '请选择左侧表' }}
              <span v-if="selectedCn" class="text-sm text-g-500 font-normal ml-2">
                （{{ selectedCn }}）
              </span>
              <span v-if="tableData" class="text-sm text-g-500 font-normal ml-2">
                共 {{ tableData.total }} 行
              </span>
            </h3>
          </div>

          <ArtTable
            :loading="rowsLoading"
            :data="tableData?.rows || []"
            :columns="columns"
            row-key="__rowKey"
          />

          <div v-if="tableData" class="mt-4 flex justify-end">
            <ElPagination
              v-model:current-page="page"
              :page-size="PAGE_SIZE"
              :total="tableData.total || 0"
              layout="total, prev, pager, next"
              background
              @current-change="loadRows"
            />
          </div>
        </div>
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import { xhamilApi } from '@/api/xhamil'
  import { columnLabel, tableLabel } from '@/utils/dbTableLabels'

  defineOptions({ name: 'XhamilDatabaseBrowse' })

  const router = useRouter()
  const PAGE_SIZE = 50

  const metaLoading = ref(false)
  const rowsLoading = ref(false)
  const meta = ref<any>(null)
  const selected = ref<string | null>(null)
  const filter = ref('')
  const page = ref(1)
  const tableData = ref<any>(null)
  const dbDisconnected = ref(false)

  function goDatabase() {
    router.push({ name: 'XhamilDatabase' })
  }

  const filteredTables = computed(() => {
    const list = meta.value?.tables || []
    const q = filter.value.trim().toLowerCase()
    if (!q) return list
    return list.filter((t: any) => {
      const name = String(t.name || '').toLowerCase()
      const cn = String(t.desc || tableLabel(t.name) || '')
      return name.includes(q) || cn.includes(filter.value.trim()) || cn.toLowerCase().includes(q)
    })
  })

  const selectedCn = computed(() => {
    if (!selected.value) return ''
    const hit = (meta.value?.tables || []).find((t: any) => t.name === selected.value)
    return tableLabel(selected.value, hit?.desc)
  })

  const columns = computed(() => {
    const cols = tableData.value?.columns as { name: string; type?: string }[] | undefined
    const keys =
      cols?.map((c) => c.name) ||
      (tableData.value?.rows?.[0] ? Object.keys(tableData.value.rows[0]).filter((k) => k !== '__rowKey') : [])
    if (!keys.length) {
      return [{ prop: '_empty', label: '—', minWidth: 120 }]
    }
    return keys.map((name: string) => {
      const metaCol = cols?.find((c) => c.name === name)
      const cn = columnLabel(name)
      const typeHint = metaCol?.type ? ` · ${metaCol.type}` : ''
      return {
        prop: name,
        label: cn ? `${name}（${cn}）${typeHint}` : `${name}${typeHint}`,
        minWidth: 140,
        showOverflowTooltip: true,
        formatter: (row: Record<string, unknown>) => {
          const v = row[name]
          if (v == null) {
            return h(
              'span',
              { class: 'text-g-400', title: '该字段无数据（NULL）' },
              '空值'
            )
          }
          if (typeof v === 'object') return JSON.stringify(v)
          const s = String(v)
          return s.length > 200 ? `${s.slice(0, 200)}…` : s
        }
      }
    })
  })

  async function loadMeta() {
    metaLoading.value = true
    try {
      const cfg = await xhamilApi.getDatabaseConfig()
      if (cfg && cfg.isConnected === false) {
        dbDisconnected.value = true
        meta.value = null
        selected.value = null
        tableData.value = null
        return
      }
      dbDisconnected.value = false
      meta.value = await xhamilApi.getDatabaseBrowseMeta()
      if (selected.value) {
        const still = (meta.value?.tables || []).find(
          (t: any) => t.name === selected.value && t.exists
        )
        if (!still) {
          selected.value = null
          tableData.value = null
        }
      }
    } catch {
      dbDisconnected.value = true
      meta.value = null
    } finally {
      metaLoading.value = false
    }
  }

  async function loadRows() {
    if (!selected.value) {
      tableData.value = null
      return
    }
    rowsLoading.value = true
    try {
      const res = await xhamilApi.getDatabaseBrowseTable(selected.value, {
        limit: PAGE_SIZE,
        offset: (page.value - 1) * PAGE_SIZE
      })
      const rows = (res?.rows || []).map((row: Record<string, unknown>, i: number) => ({
        ...row,
        __rowKey: `${selected.value}-${(page.value - 1) * PAGE_SIZE + i}`
      }))
      tableData.value = { ...res, rows }
    } finally {
      rowsLoading.value = false
    }
  }

  function selectTable(name: string) {
    selected.value = name
    page.value = 1
    loadRows()
  }

  async function refreshAll() {
    await loadMeta()
    if (selected.value) await loadRows()
  }

  onMounted(loadMeta)
</script>

<style scoped lang="scss">
  .table-list {
    max-height: calc(100vh - 260px);
    overflow: auto;
  }

  .table-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    margin-bottom: 4px;
    border: none;
    border-radius: 8px;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    color: var(--el-text-color-primary);

    &:hover:not(.disabled) {
      background: var(--el-fill-color-light);
    }

    &.active {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      font-weight: 500;
    }

    &.disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
</style>
