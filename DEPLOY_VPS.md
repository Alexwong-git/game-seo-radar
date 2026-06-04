# Game SEO Radar VPS 部署手册

这份手册适用于你当前的腾讯云新加坡 VPS：

- 系统：Ubuntu 24.04 LTS
- Docker / docker-compose 1.29.2：已安装
- 项目目录：`/opt/game-seo-radar`
- 数据目录：`/opt/game-seo-radar/data`
- 日志目录：`/opt/game-seo-radar/logs`
- 备份目录：`/opt/game-seo-radar/backups`
- Web 后台端口：`3002`

## 1. 本地打包并上传项目

在本地项目目录执行：

```bash
cd "/Users/alex/Documents/New project 5"
tar \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "data/*.sqlite" \
  --exclude "data/*.sqlite-shm" \
  --exclude "data/*.sqlite-wal" \
  --exclude "logs" \
  --exclude "backups" \
  -czf game-seo-radar.tar.gz .
```

上传到 VPS。把下面的 `YOUR_SERVER_IP` 换成你的服务器 IP：

```bash
scp game-seo-radar.tar.gz root@YOUR_SERVER_IP:/tmp/
```

登录 VPS：

```bash
ssh root@YOUR_SERVER_IP
```

在 VPS 创建目录并解压：

```bash
mkdir -p /opt/game-seo-radar
tar -xzf /tmp/game-seo-radar.tar.gz -C /opt/game-seo-radar
cd /opt/game-seo-radar
mkdir -p data logs backups
chmod +x scripts/*.sh
```

## 2. 创建 .env

在 VPS 的 `/opt/game-seo-radar` 目录执行：

```bash
cd /opt/game-seo-radar
cp .env.example .env
nano .env
```

建议内容：

```env
NODE_ENV=production
TZ=Asia/Shanghai

PORT=3002
HOST=0.0.0.0
DATABASE_PATH=/app/data/radar.sqlite

RADAR_USER=admin
RADAR_PASSWORD=replace-with-a-long-random-password
```

保存后退出。`RADAR_PASSWORD` 一定要改成强密码。

## 3. 构建 Docker 镜像

```bash
cd /opt/game-seo-radar
docker-compose build
```

## 4. 启动服务

```bash
docker-compose up -d
```

确认容器状态：

```bash
docker-compose ps
```

如果这是服务器第一次部署，并且还没有站点配置，可以先导入内置推荐竞品站：

```bash
docker-compose run --rm radar npm run seed
docker-compose restart radar
```

## 5. 查看日志

查看 Docker 实时日志：

```bash
docker-compose logs -f radar
```

查看写入文件的 Web 日志：

```bash
tail -f /opt/game-seo-radar/logs/web.log
```

## 6. 重启服务

```bash
cd /opt/game-seo-radar
docker-compose restart radar
```

如果更新了代码或 Dockerfile：

```bash
cd /opt/game-seo-radar
docker-compose build
docker-compose up -d
```

## 7. 停止服务

```bash
cd /opt/game-seo-radar
docker-compose down
```

这不会删除 `data`、`logs`、`backups` 目录里的数据。

## 8. 手动执行 crawl

日常增量抓取：

```bash
cd /opt/game-seo-radar
./scripts/crawl.sh
```

查看抓取日志：

```bash
tail -f /opt/game-seo-radar/logs/crawl.log
```

第一次正式使用时，建议先在后台或命令行跑 baseline：

```bash
cd /opt/game-seo-radar
docker-compose run --rm radar npm run baseline
```

baseline 是历史库存，不生成机会词；后续 `crawl` 才是真实增量信号。

## 9. 配置 cron 每 6 小时执行 crawl

编辑 root 用户的 cron：

```bash
crontab -e
```

加入这一行：

```cron
0 */6 * * * cd /opt/game-seo-radar && /opt/game-seo-radar/scripts/crawl.sh >> /opt/game-seo-radar/logs/cron.log 2>&1
```

查看 cron 是否写入：

```bash
crontab -l
```

## 10. 备份 SQLite

手动备份：

```bash
cd /opt/game-seo-radar
./scripts/backup.sh
```

查看备份文件：

```bash
ls -lh /opt/game-seo-radar/backups
```

备份脚本会生成类似：

```text
radar-20260604-153000.sqlite.gz
```

脚本默认删除 30 天前的旧备份。

可以每天凌晨 3 点自动备份：

```bash
crontab -e
```

加入：

```cron
0 3 * * * cd /opt/game-seo-radar && /opt/game-seo-radar/scripts/backup.sh >> /opt/game-seo-radar/logs/cron.log 2>&1
```

## 11. 访问后台

浏览器打开：

```text
http://服务器IP:3002
```

如果 `.env` 里配置了：

```env
RADAR_USER=admin
RADAR_PASSWORD=your-password
```

浏览器会弹出基础登录框。

如果打不开，请先确认腾讯云安全组已经放行 TCP `3002` 端口。

## 12. 常见错误排查

### 端口打不开

检查容器是否运行：

```bash
cd /opt/game-seo-radar
docker-compose ps
```

检查端口映射：

```bash
docker-compose port radar 3002
```

确认腾讯云安全组已放行 `3002`。

### 登录框一直失败

查看 `.env`：

```bash
cd /opt/game-seo-radar
cat .env
```

确认 `RADAR_USER` 和 `RADAR_PASSWORD` 没有多余空格。修改后重启：

```bash
docker-compose restart radar
```

### 数据没有持久化

确认数据库文件在宿主机目录：

```bash
ls -lh /opt/game-seo-radar/data
```

应该能看到：

```text
radar.sqlite
radar.sqlite-shm
radar.sqlite-wal
```

确认 `.env` 中：

```env
DATABASE_PATH=/app/data/radar.sqlite
```

### crawl 没有运行

手动执行一次：

```bash
cd /opt/game-seo-radar
./scripts/crawl.sh
```

查看日志：

```bash
tail -n 200 /opt/game-seo-radar/logs/crawl.log
```

如果是网络超时或某个 sitemap 失败，系统通常会记录为 `partial` 或 `failed`，不会影响其他站点继续抓取。

### Docker build 失败

重新构建并显示完整日志：

```bash
cd /opt/game-seo-radar
docker-compose build --no-cache
```

确认 VPS 可以访问 Docker Hub。如果无法拉取 `node:24-bookworm-slim`，需要检查服务器网络或 Docker 镜像源。

### 修改代码后没有生效

重新构建并启动：

```bash
cd /opt/game-seo-radar
docker-compose build
docker-compose up -d
```

### 想恢复备份

先停止服务：

```bash
cd /opt/game-seo-radar
docker-compose down
```

解压指定备份并覆盖数据库：

```bash
gunzip -c /opt/game-seo-radar/backups/radar-YYYYMMDD-HHMMSS.sqlite.gz > /opt/game-seo-radar/data/radar.sqlite
rm -f /opt/game-seo-radar/data/radar.sqlite-shm /opt/game-seo-radar/data/radar.sqlite-wal
docker-compose up -d
```
