# 私有部署说明

这个项目可以部署在一台普通 VPS 上，只给自己访问。推荐先用 SQLite + 文件备份，等数据量和使用频率上来后再迁移 Postgres。

## 服务器建议

- 1 vCPU / 1GB RAM 起步即可。
- 磁盘建议 20GB 以上。
- Node.js 22+，当前开发环境使用 Node.js 24。
- 防火墙只开放 SSH 和反向代理端口。

## 私有访问

应用内置 Basic Auth。启动时设置：

```bash
RADAR_USER=admin RADAR_PASSWORD=your-strong-password HOST=127.0.0.1 PORT=3000 npm run dev
```

如果通过 Nginx / Caddy 暴露公网，建议让 Node 仍然只监听 `127.0.0.1`，由反向代理负责 HTTPS。

## systemd 示例

```ini
[Unit]
Description=Game SEO Radar
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/game-seo-radar
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=RADAR_USER=admin
Environment=RADAR_PASSWORD=change-me
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 定时任务建议

先跑一次全量基线：

```bash
npm run baseline
```

之后每天跑增量：

```bash
npm run crawl
```

cron 示例：

```cron
15 9,18 * * * cd /opt/game-seo-radar && npm run crawl >> data/crawl.log 2>&1
```

时间口径统一按北京时间展示和统计。

## 备份

核心资产是：

```text
data/radar.sqlite
```

建议每天备份一次：

```bash
sqlite3 data/radar.sqlite ".backup 'data/radar-$(date +%F).sqlite'"
```
