# 部署与共存方案

## 与旧系统共存架构

```
用户请求 → Nginx → 路由判断 → 旧系统 (numind-web)
                            ↘ 新系统 (numind-web-v3) /v3/
```

## 腾讯云服务器镜像加速（解决拉取慢的问题）

### 配置镜像加速器

在腾讯云服务器上执行：

```bash
# 1. 创建/编辑 Docker 配置文件
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
EOF

# 2. 重启 Docker 服务
sudo systemctl daemon-reload
sudo systemctl restart docker

# 3. 验证配置
docker info | grep -A 10 "Registry Mirrors"
```

### 常用镜像加速器地址

| 提供商 | 地址 | 速度 |
|--------|------|------|
| 中国科技大学 | `https://docker.mirrors.ustc.edu.cn` | ⭐⭐⭐⭐⭐ |
| 网易云 | `https://hub-mirror.c.163.com` | ⭐⭐⭐⭐ |
| 百度云 | `https://mirror.baidubce.com` | ⭐⭐⭐⭐ |

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

1. **构建镜像**（GitHub Actions 自动完成）
   ```bash
   # 已在 .github/workflows/ci-cd.yml 中配置
   # 推送到 Docker Hub: neozhang96/numind-web-v3
   ```

2. **腾讯云服务器拉取**（使用镜像加速）
   ```bash
   docker pull neozhang96/numind-web-v3:develop
   ```

3. **启动服务**
   ```bash
   docker-compose up -d numind-web-v3
   ```

## Nginx 共存配置

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

## 迁移路线图

| 阶段 | 内容 | 访问路径 |
|------|------|----------|
| Phase 0 | 项目搭建 | /v3/ (开发中) |
| Phase 1 | 登录页迁移 | /v3/login |
| Phase 2 | 设置页迁移 | /v3/settings |
| Phase 3 | SOP 详情页 | /v3/sop/:id |
| ... | 逐步迁移 | ... |
| 最终 | 全部完成 | / (替换旧系统) |

## 故障排查

### 拉取镜像仍然很慢？

检查镜像加速器是否生效：
```bash
docker info | grep -A 10 "Registry Mirrors"
# 应该显示配置的加速器地址
```

### 镜像加速器失效？

尝试更换其他加速器地址，编辑 `/etc/docker/daemon.json`：
```json
{
  "registry-mirrors": [
    "https://其他镜像地址.com"
  ]
}
```

然后重启 Docker：
```bash
sudo systemctl restart docker
```