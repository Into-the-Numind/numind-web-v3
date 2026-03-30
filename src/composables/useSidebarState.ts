import { ref } from 'vue'

const collapsed = ref(false)

export function useSidebarState() {
  const toggle = () => {
    collapsed.value = !collapsed.value
  }

  return { collapsed, toggle }
}
