<!-- 翻页复用 DOM 时也能正确回落默认头像，避免破图/空头像 -->
<template>
  <img
    :key="`${uid}-${resolved}`"
    :src="current"
    :alt="alt"
    :class="imgClass"
    :style="imgStyle"
    @error="onError"
  />
</template>

<script setup lang="ts">
  import { avatarSrc, mediaUrl, DEFAULT_AVATAR_URL } from '@/utils/xhamilMedia'

  /** 默认图也加载失败时的占位（永不破图） */
  const PLACEHOLDER =
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
        <rect width="80" height="80" rx="40" fill="#e5e7eb"/>
        <circle cx="40" cy="30" r="14" fill="#9ca3af"/>
        <ellipse cx="40" cy="68" rx="24" ry="18" fill="#9ca3af"/>
      </svg>`
    )

  const props = withDefaults(
    defineProps<{
      src?: string | null
      uid?: string | number
      size?: number
      round?: boolean
      alt?: string
      imgClass?: string
    }>(),
    {
      src: '',
      uid: '',
      size: 40,
      round: true,
      alt: '',
      imgClass: ''
    }
  )

  const resolved = computed(() => avatarSrc(props.src))
  const defaultUrl = mediaUrl(DEFAULT_AVATAR_URL)
  const current = ref(resolved.value)
  const stage = ref<'src' | 'default' | 'placeholder'>('src')

  watch(
    () => [props.src, props.uid] as const,
    () => {
      stage.value = 'src'
      current.value = resolved.value
    },
    { immediate: true }
  )

  const imgStyle = computed(() => ({
    width: `${props.size}px`,
    height: `${props.size}px`
  }))

  function onError() {
    if (stage.value === 'src') {
      stage.value = 'default'
      current.value = defaultUrl || PLACEHOLDER
      return
    }
    if (stage.value === 'default') {
      stage.value = 'placeholder'
      current.value = PLACEHOLDER
    }
  }
</script>
