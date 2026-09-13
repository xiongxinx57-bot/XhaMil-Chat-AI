<!-- 聊天图片管理 -->
<template>
  <MediaBrowser
    title="聊天图片"
    subtitle="聊天消息中的图片文件"
    kind="image"
    :load-fn="loadFn"
    :delete-fn="deleteFn"
    :delete-all-fn="deleteAllFn"
  />
</template>

<script setup lang="ts">
  import { xhamilApi } from '@/api/xhamil'
  import MediaBrowser from '../media/MediaBrowser.vue'

  defineOptions({ name: 'XhamilChatPhotos' })

  const loadFn = () => xhamilApi.getChatPhotos()
  const deleteFn = (filename: string) => xhamilApi.deleteChatPhoto(filename)
  const deleteAllFn = () => xhamilApi.deleteAllChatPhotos()
</script>
