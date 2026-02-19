# 构建阶段
FROM node:18-alpine AS builder

# 构建参数
ARG VITE_APP_ENV=production
ARG VITE_API_BASE_URL

# 设置环境变量
ENV VITE_APP_ENV=${VITE_APP_ENV}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm ci

# 复制源码并构建
COPY . .
RUN npm run build-only

# 生产阶段
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:80/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
