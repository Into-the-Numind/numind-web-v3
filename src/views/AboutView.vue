<template>
  <div class="about">
    <h1>关于莫小派 v3</h1>
    <p>这是一个渐进式重构项目</p>
    <ul>
      <li>Vue 3 + Composition API</li>
      <li>Vite 构建工具</li>
      <li>Pinia 状态管理</li>
      <li>Vue Router 路由</li>
    </ul>
    <RouterLink to="/">返回首页</RouterLink>
  </div>
</template>

<style scoped>
.about {
  padding: 2rem;
  max-width: 600px;
  margin: 0 auto;
}

ul {
  text-align: left;
  margin: 2rem 0;
}
</style>