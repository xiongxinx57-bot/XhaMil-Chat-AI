<!-- 群公告图片管理 -->
<template>
  <MediaBrowser
    title="群公告图片"
    subtitle="群公告中上传的图片"
    kind="image"
    :load-fn="loadFn"
    :delete-fn="deleteFn"
  />
</template>

<script setup lang="ts">
  import { xhamilApi } from '@/api/xhamil'
  import MediaBrowser from '../media/MediaBrowser.vue'

  defineOptions({ name: 'XhamilGroupAnnouncementImages' })

  const loadFn = () => xhamilApi.getGroupAnnouncementImages()
  const deleteFn = (filename: string) => xhamilApi.deleteGroupAnnouncementImage(filename)
</script>
