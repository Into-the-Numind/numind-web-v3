# 构建阶段
FROM node:18-alpine AS builder

# 构建参数
ARG VITE_APP_ENV=production
ARG VITE_API_BASE_URL
# notification-center 铃铛显隐：dev/qa 传 true 开，prod 不传=隐藏（保持休眠隔离）
ARG VITE_ENABLE_NOTIFICATIONS
# document-system「打开编辑」入口显隐：dev/qa 传 true 开，prod 不传=隐藏（休眠隔离）
ARG VITE_ENABLE_DOCUMENT_SYSTEM
# meeting-copilot「会议副驾」入口显隐：dev/qa 传 true 开，prod 不传=隐藏（休眠隔离）
ARG VITE_ENABLE_MEETING_COPILOT

# 设置环境变量
ENV VITE_APP_ENV=${VITE_APP_ENV}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_ENABLE_NOTIFICATIONS=${VITE_ENABLE_NOTIFICATIONS}
ENV VITE_ENABLE_DOCUMENT_SYSTEM=${VITE_ENABLE_DOCUMENT_SYSTEM}
ENV VITE_ENABLE_MEETING_COPILOT=${VITE_ENABLE_MEETING_COPILOT}

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm ci

# 复制源码并构建
COPY . .
RUN npm run build-only

# 生产阶段
FROM nginx:alpine

# 运行时需要 curl(健康检查) 与 envsubst(渲染 nginx 模板)
RUN apk add --no-cache curl gettext

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 模板与启动脚本（按环境注入 API 上游）
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:80/health || exit 1

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
