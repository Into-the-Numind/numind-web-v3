<script setup lang="ts">
import { Bot, MessageSquare, HelpCircle, Scale, Info } from 'lucide-vue-next'
</script>

<template>
  <div class="welcome-screen">
    <div class="welcome-content">
      <div class="welcome-icon">
        <Bot :size="32" />
      </div>
      <h1 class="welcome-title">你好，我是销售智能助手</h1>
      <p class="welcome-subtitle">我能基于知识库为你生成话术或提供策略建议</p>
      <div class="suggestion-cards">
        <div class="suggestion-card suggestion-card--static">
          <MessageSquare :size="18" />
          <span class="suggestion-text">客户说"太贵了"，帮我回复</span>
        </div>
        <div class="suggestion-card suggestion-card--static">
          <HelpCircle :size="18" />
          <span class="suggestion-text">客户进入犹豫期，如何跟进？</span>
        </div>
        <div class="suggestion-card suggestion-card--static">
          <Scale :size="18" />
          <span class="suggestion-text">客户问我们和竞品的区别</span>
        </div>
      </div>
      <p class="welcome-hint">
        <Info :size="14" />
        <span>配置知识库，让回复更精准</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.welcome-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 500px;
  padding: 40px 20px;
  animation: welcomeFadeIn 0.6s ease-out;
}

@keyframes welcomeFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-screen {
    animation: none;
  }
}

.welcome-content {
  max-width: 700px;
  text-align: center;
}

.welcome-icon {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  border-radius: 24px;
  margin: 0 auto 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 30px rgba(37, 167, 105, 0.3);
  animation: iconFloat 3s ease-in-out infinite;
  color: white;
}

@keyframes iconFloat {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-icon {
    animation: none;
  }
}

.welcome-title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 16px;
  line-height: 1.3;
}

.welcome-subtitle {
  font-size: 1.05rem;
  color: var(--text-muted);
  margin: 0 0 48px;
  line-height: 1.6;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.suggestion-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-bottom: 40px;
}

.suggestion-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  text-align: left;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.suggestion-card--static {
  cursor: default;
  pointer-events: none;
  user-select: none;
}

.suggestion-card :deep(svg) {
  width: 24px;
  height: 24px;
  color: var(--primary);
  flex-shrink: 0;
}

.suggestion-text {
  font-size: 0.95rem;
  color: var(--text);
  font-weight: 500;
  line-height: 1.4;
}

.welcome-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-muted);
  background: rgba(37, 167, 105, 0.05);
  padding: 12px 20px;
  border-radius: 12px;
  border: 1px solid rgba(37, 167, 105, 0.1);
  margin: 0 auto;
  max-width: fit-content;
}

@media (max-width: 768px) {
  .welcome-title {
    font-size: 1.5rem;
  }

  .welcome-subtitle {
    font-size: 0.95rem;
    margin-bottom: 32px;
  }

  .suggestion-cards {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .suggestion-card {
    padding: 16px;
  }

  .welcome-hint {
    font-size: 0.8rem;
    padding: 10px 16px;
    flex-direction: column;
    text-align: center;
  }
}
</style>
