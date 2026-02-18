# 部署与共存方案

## 与旧系统共存架构

```
用户请求 → Nginx → 路由判断 → 旧系统 (numind-web)
                            ↘ 新系统 (numind-web-v3) /v3/
```

## Nginx 配置示例

```nginx
server {
    listen 80;
    server_name youshu.asia;
    
    # 新版本入口
    location /v3/ {
        proxy_pass http://numind-web-v3:80/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # 默认旧版本
    location / {
        proxy_pass http://numind-web:80/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Docker Compose 配置

```yaml
version: '3.8'

services:
  # 旧系统
  numind-web:
    image: neozhang96/numind-web:latest
    container_name: numind-web
    restart: unless-stopped
    
  # 新系统 (Phase 0)
  numind-web-v3:
    image: neozhang96/numind-web-v3:develop
    container_name: numind-web-v3
    restart: unless-stopped
    
  # Nginx 网关
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - numind-web
      - numind-web-v3
```

## 本地开发

```bash
# 旧系统
cd numind-web
python3 -m http.server 8080

# 新系统 (另一个终端)
cd numind-web-v3
npm install
npm run dev  # http://localhost:5173
```

## 部署流程

1. **构建镜像**
   ```bash
   docker build -t neozhang96/numind-web-v3:develop .
   docker push neozhang96/numind-web-v3:develop
   ```

2. **部署到服务器**
   ```bash
   docker-compose up -d numind-web-v3
   ```

3. **访问验证**
   - 旧系统: https://youshu.asia/
   - 新系统: https://youshu.asia/v3/

## 迁移路线图

| 阶段 | 内容 | 访问路径 |
|------|------|----------|
| Phase 0 | 项目搭建 | /v3/ (开发中) |
| Phase 1 | 登录页迁移 | /v3/login |
| Phase 2 | 设置页迁移 | /v3/settings |
| Phase 3 | SOP 详情页 | /v3/sop/:id |
| ... | 逐步迁移 | ... |
| 最终 | 全部完成 | / (替换旧系统) |