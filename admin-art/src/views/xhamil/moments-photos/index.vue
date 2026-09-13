<!-- 说说图片管理 -->
<template>
  <MediaBrowser
    title="说说图片"
    subtitle="朋友圈 / 说说动态中的图片"
    kind="image"
    :load-fn="loadFn"
    :delete-fn="deleteFn"
    :delete-all-fn="deleteAllFn"
  />
</template>

<script setup lang="ts">
  import { xhamilApi } from '@/api/xhamil'
  import MediaBrowser from '../media/MediaBrowser.vue'

  defineOptions({ name: 'XhamilMomentsPhotos' })

  const loadFn = () => xhamilApi.getMomentsPhotos()
  const deleteFn = (filename: string) => xhamilApi.deleteMomentsPhoto(filename)
  const deleteAllFn = () => xhamilApi.deleteAllMomentsPhotos()
</script>
