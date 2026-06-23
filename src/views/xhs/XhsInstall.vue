<!--
  XhsInstall — 浏览器插件安装引导（T8）

  图文步骤：下载 → 解压 → chrome://extensions 开发者模式 → 加载已解压。
  视频引导占位。底部"授权"按钮跳 ConnectExtension。
-->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeft, Download, Shield } from 'lucide-vue-next'

import AppButton from '@/components/common/AppButton.vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { EXTENSION_DOWNLOAD_URL, EXTENSION_VIDEO_URL } from './extensionConstants'

const router = useRouter()

const steps: { title: string; desc: string }[] = [
  {
    title: '下载插件包',
    desc: '点击上方「下载插件包」按钮，保存 zip 文件到本地。'
  },
  {
    title: '解压',
    desc: '将下载的 zip 解压到一个固定目录（不要删除，插件运行依赖该目录）。'
  },
  {
    title: '打开扩展管理页',
    desc: '在 Chrome 地址栏输入 chrome://extensions 回车，打开右上角「开发者模式」开关。'
  },
  {
    title: '加载已解压的扩展',
    desc: '点击「加载已解压的扩展程序」，选择第 2 步解压出的目录，即可看到插件出现在列表中。'
  },
  {
    title: '授权采集',
    desc: '点击下方「去授权」，登录态会安全地传给插件，之后即可在小红书一键采集笔记。'
  }
]
</script>

<template>
  <MainLayout>
    <div class="xhs-install">
      <div class="back-link" @click="router.push('/xhs')">
        <ArrowLeft :size="16" />
        <span>返回选题库</span>
      </div>

      <header class="page-header">
        <h1>安装采集插件</h1>
        <a :href="EXTENSION_DOWNLOAD_URL" download>
          <AppButton variant="primary" size="md">
            <Download :size="16" />
            下载插件包
          </AppButton>
        </a>
      </header>

      <p class="lead">
        采集插件运行在你自己的浏览器里，使用你真实的登录态浏览小红书并一键采集感兴趣的笔记，
        采集结果会自动同步到选题库并进行 AI 分析。
      </p>

      <!-- 图文步骤 -->
      <ol class="steps">
        <li v-for="(s, i) in steps" :key="i" class="step">
          <div class="step__num">{{ i + 1 }}</div>
          <div class="step__body">
            <h3>{{ s.title }}</h3>
            <p>{{ s.desc }}</p>
          </div>
        </li>
      </ol>

      <!-- 视频引导（占位） -->
      <section class="video-section">
        <h2>视频引导</h2>
        <div v-if="EXTENSION_VIDEO_URL" class="video-wrap">
          <video :src="EXTENSION_VIDEO_URL" controls />
        </div>
        <div v-else class="video-placeholder">
          <p>视频引导即将上线</p>
        </div>
      </section>

      <!-- 授权 CTA -->
      <div class="authorize">
        <AppButton variant="primary" size="lg" @click="router.push('/connect-extension')">
          <Shield :size="18" />
          去授权
        </AppButton>
        <span class="authorize-hint">安装完成后点此把登录态安全地交给插件</span>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
.xhs-install {
  max-width: 760px;
  margin: 0 auto;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-muted, #6b7085);
  cursor: pointer;
  margin-bottom: 20px;
  user-select: none;
}

.back-link:hover {
  color: var(--primary, #10b981);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text, #1a1d26);
}

.page-header a {
  text-decoration: none;
}

.lead {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary, #4b5563);
  margin-bottom: 28px;
}

.steps {
  list-style: none;
  margin: 0 0 32px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  background: #f8f9fb;
  border-radius: 12px;
  padding: 16px 18px;
}

.step__num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary, #10b981);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step__body h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text, #1a1d26);
}

.step__body p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #4b5563);
}

.video-section {
  margin-bottom: 32px;
}

.video-section h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 12px;
  color: var(--text, #1a1d26);
}

.video-wrap video {
  width: 100%;
  border-radius: 12px;
}

.video-placeholder {
  background: #f0f1f5;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 48px 20px;
  text-align: center;
  color: var(--text-muted, #9ea1b1);
  font-size: 14px;
}

.authorize {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: #ecfdf5;
  border-radius: 12px;
}

.authorize-hint {
  font-size: 13px;
  color: var(--text-secondary, #4b5563);
}
</style>
