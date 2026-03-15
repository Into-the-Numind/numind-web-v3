# 部署方案

## 架构

```
用户请求 → Nginx (youshu.asia) → numind-web-v3 (localhost:9202)
```

> 注：原版前端 `numind-web` 已于 2026-03-15 下线。V3 现在是唯一的前端。

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
cd numind-web-v3
npm install
npm run dev  # http://localhost:5173
```

## 部署流程

1. **构建镜像**（GitHub Actions 自动完成）
   ```bash
   # 已在 .github/workflows/ci-cd.yml 中配置
   # 推送到 Docker Hub: pmtmyaggy/numind-web-v3
   ```

2. **腾讯云服务器拉取**（使用镜像加速）
   ```bash
   docker pull pmtmyaggy/numind-web-v3:develop
   ```

3. **启动服务**
   ```bash
   docker-compose up -d numind-web-v3
   ```

## V3 API 反代（关键）

`numind-web-v3` 容器内统一走同源 `/api`，由容器 Nginx 转发到后端，避免浏览器 CORS。

- 环境变量：`API_PROXY_PASS`
- 说明：填写当前环境后端 API 的完整上游前缀（必须包含末尾 `/`）

示例（请按你的实际后端地址替换）：

```bash
# dev（IP + 端口访问）
docker run -e API_PROXY_PASS="http://<dev-backend-ip>:<port>/" ...

# qa（IP + 端口访问）
docker run -e API_PROXY_PASS="http://<qa-backend-ip>:<port>/" ...

# prod（域名访问）
docker run -e API_PROXY_PASS="https://youshu.asia/" ...
```

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
