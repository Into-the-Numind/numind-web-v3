<template>
  <div class="home">
    <h1>莫小派工作站 v3</h1>
    <p>基于 Vue 3 + Vite 的新版本</p>
    <nav>
      <RouterLink to="/login">登录</RouterLink>
      <RouterLink to="/about">关于</RouterLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.home {
  padding: 2rem;
  text-align: center;
}

h1 {
  color: var(--color-primary);
  margin-bottom: 1rem;
}

nav {
  margin-top: 2rem;
  display: flex;
  gap: 1rem;
  justify-content: center;
}
</style>