import { ref, computed, onBeforeUnmount, type Ref } from 'vue'

export function useAutoScroll(
  containerRef: Ref<HTMLElement | null>,
  options?: { threshold?: number; showButtonDistance?: number }
) {
  const threshold = options?.threshold ?? 150
  const showButtonDistance = options?.showButtonDistance ?? 300

  const autoScrollEnabled = ref(true)
  const isAtBottomState = ref(true)
  let lastScrollTop = 0
  let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null

  function isAtBottom(container: HTMLElement, margin = threshold): boolean {
    return container.scrollHeight - container.scrollTop - container.clientHeight <= margin
  }

  function scrollToBottom(smooth = false) {
    const el = containerRef.value
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant'
    })
  }

  function smartScrollToBottom() {
    if (autoScrollEnabled.value) {
      scrollToBottom()
    }
  }

  function onScroll() {
    const el = containerRef.value
    if (!el) return

    if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer)
    scrollDebounceTimer = setTimeout(() => {
      const currentScrollTop = el.scrollTop
      const scrolledUp = currentScrollTop < lastScrollTop - 10

      if (scrolledUp) {
        autoScrollEnabled.value = false
      }

      if (isAtBottom(el)) {
        autoScrollEnabled.value = true
      }

      isAtBottomState.value = isAtBottom(el, showButtonDistance)
      lastScrollTop = currentScrollTop
    }, 30)
  }

  const showScrollButton = computed(() => {
    return !isAtBottomState.value
  })

  function handleScrollToBottomClick() {
    autoScrollEnabled.value = true
    scrollToBottom(true)
  }

  onBeforeUnmount(() => {
    if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer)
  })

  return {
    autoScrollEnabled,
    scrollToBottom,
    smartScrollToBottom,
    onScroll,
    showScrollButton,
    handleScrollToBottomClick
  }
}
