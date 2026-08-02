# 存储节点 (Storage Node) 独立部署指南

本文档指导如何在**全新的异地 Linux 存储服务器（VPS/物理机）**上独立部署 Storage Node 服务。

---

## 方式一：Docker Compose 独立部署 (强烈推荐，一键搞定)

主仓库中包含了专用于存储节点的编排文件 [docker-compose.yml](file:///c:/Users/Ryu/Documents/mobile-paywall/mobile-paywall/packages/storage-node/docker-compose.yml)。只需在新服务器上下载该文件即可一键拉取 GHCR 镜像并运行。

```bash
# 1. 下载独立存储节点的 docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/qualvey/mTube/main/packages/storage-node/docker-compose.yml -o docker-compose.yml

# 2. 启动服务 (通过环境变量指定端口、节点 ID、节点名称及硬盘挂载路径)
PORT=3002 \
NODE_ID=node-02 \
NODE_NAME="香港存储节点 02" \
STORAGE_DATA_PATH=/var/storage/uploads \
docker compose up -d
```

---

## 方式二：Docker CLI 直接拉取镜像运行

```bash
# 一键运行 GHCR 官方构建镜像
docker run -d \
  --name storage-node-02 \
  --restart always \
  -p 3002:3001 \
  -e PORT=3001 \
  -e NODE_ID=node-02 \
  -e NODE_NAME="香港存储节点 02" \
  -v /var/storage/uploads:/app/public/uploads \
  ghcr.io/qualvey/mtube/storage-node:latest
```

---

## 方式三：原生 PM2 部署方式

```bash
# 1. 安装基础依赖 (Node.js & FFmpeg)
sudo apt update && sudo apt install -y nodejs npm ffmpeg
sudo npm install -g pm2

# 2. 上传 packages/storage-node 代码并启动 PM2 守护进程
cd storage-node
npm install --production

PORT=3002 NODE_ID=node-02 NODE_NAME="香港存储节点 02" pm2 start src/index.js --name "storage-node-02"
pm2 save
```

---

## 在 B 端管理后台注册节点

服务启动后，验证连通性：
```bash
curl http://<新服务器IP>:3002/api/v1/storage/status
```
返回 `{"code":200,"message":"success","data":{"nodeId":"node-02","status":"ONLINE",...}}` 即代表部署成功！

登录主站管理后台 (**B 端**)：
1. 切换至 **⚙️ 系统设置** 页面。
2. 在 **多存储节点管理** 卡片中点击 **【+ 注册新存储节点】**。
3. 填入节点 ID (`node-02`)、名称与 Base URL (`http://<新服务器IP>:3002`)。
4. 点击 **【确认注册添加】** 即可在发布/编辑视频时直接选择该节点上传！
