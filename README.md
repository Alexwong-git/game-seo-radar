# 游戏 SEO 找词雷达系统

一个本地 MVP，用“站找词”的方式监控大型游戏站公开 `sitemap` / `robots.txt`，发现新增游戏页面，从 URL slug 中提取候选游戏关键词，并用简单评分辅助判断是否值得快速开发页面。

## 功能范围

- 管理多个竞品游戏站，支持启用 / 禁用。
- 支持手动配置 `sitemap.xml`，未配置时读取 `/robots.txt` 中的 `Sitemap:`。
- 支持 sitemap index 递归解析，保存 URL、`lastmod`、来源站点、抓取时间。
- 保存历史 URL，识别新增 URL 和最近更新 URL。
- 支持 Baseline / Incremental 两种抓取模式：基线只记录历史库存，增量才生成机会词。
- 从 URL slug 提取游戏名，并生成候选关键词变体。
- 后台页面包含 Dashboard、Sites、New URLs、Keywords、Keyword Detail。
- 使用本地 SQLite 存储，并可从第一版 `data/db.json` 自动迁移。
- 支持站点级 URL include / exclude 过滤规则，降低 sitemap 噪音。
- 支持站点级请求间隔、超时、单个 sitemap 大小限制和单次 URL 数量上限。
- sitemap 请求有超时和有限重试，单个子 sitemap 失败会记录为 partial，不会轻易拖垮整站抓取。
- 增量扫描会优先处理带 `lastmod` 的最新 URL 和最新子 sitemap，避免大站只反复扫描旧库存。
- Dashboard 内置网站雷达，可一键启用 A/B 级扩展信号源。
- 内置 119 个自有词根，可导入 Roots 工作台，后续用于 Trends / Suggest API 挖掘新词。
- 支持记录上线 URL、收录状态、7 天曝光点击和复盘备注。
- 时间展示和每日统计统一使用北京时间。
- 可通过 `RADAR_PASSWORD` 开启私有访问。

## 目录结构

```text
.
├── data/
│   ├── db.json              # 第一版 JSON 数据；首次启动 SQLite 时会自动迁移
│   └── radar.sqlite         # 本地 SQLite 数据库
├── lib/
│   ├── auth.js              # 私有访问鉴权
│   ├── db.js                # SQLite 存储、迁移、ID 工具
│   ├── keyword-root-seeds.js # 自有词根 seed 数据
│   ├── keyword-roots.js      # 词根导入、统计和归一化
│   ├── keywords.js          # 游戏名提取和候选词生成
│   ├── recommended-sites.js # 推荐竞品站配置
│   ├── scoring.js           # 100 分制评分
│   ├── sitemap.js           # robots/sitemap 抓取、递归解析、diff
│   └── time.js              # 北京时间工具
├── public/
│   └── styles.css           # 后台样式
├── scripts/
│   └── crawl-once.sh        # 可挂 cron 的抓取脚本
├── src/
│   ├── cli.js               # 命令行入口
│   └── server.js            # 本地后台 HTTP 服务
├── package.json
└── README.md
```

## 数据模型

`sites`

- `id`
- `domain`
- `sitemap_url`
- `include_patterns`
- `exclude_patterns`
- `request_delay_ms`
- `timeout_ms`
- `max_sitemap_bytes`
- `baseline_url_limit`
- `incremental_url_limit`
- `max_sitemaps_per_run`
- `baseline_completed_at`
- `enabled`
- `notes`
- `created_at`
- `updated_at`

`urls`

- `id`
- `url`
- `lastmod`
- `source_site`
- `sitemap_url`
- `first_seen_at`
- `last_seen_at`
- `fetched_at`
- `discovery_type`: `baseline` / `incremental`
- `is_new`
- `is_recently_updated`

`keywords`

- `id`
- `first_seen_date`
- `source_site`
- `source_url`
- `keyword`
- `game_name`
- `variants`
- `status`: `new` / `observing` / `selected` / `rejected` / `launched`
- `notes`
- `google_trends_status`: `unknown` / `rising` / `stable` / `declining`
- `production_difficulty`: `low` / `medium` / `high`
- `serp_competition`: `low` / `medium` / `high`
- `priority_score`
- `build_signal`: `should_build` / `observe` / `reject`
- `score_breakdown`
- `source_discovery_type`: `incremental`
- `launched_url`
- `launched_date`
- `indexed_status`: `unknown` / `not_checked` / `indexed` / `not_indexed`
- `impressions_7d`
- `clicks_7d`
- `result_notes`
- `created_at`
- `updated_at`

`keyword_roots`

- `id`
- `source_order`
- `site_type`
- `root`
- `raw_root`
- `example_queries`
- `user_intent`
- `opportunity`
- `monthly_volume`
- `enabled`
- `last_mined_at`
- `notes`
- `created_at`
- `updated_at`

`runs`

- `id`
- `site_id`
- `site_domain`
- `started_at`
- `finished_at`
- `fetched_url_count`
- `matched_url_count`
- `filtered_url_count`
- `new_url_count`
- `updated_url_count`
- `run_date`
- `run_type`: `baseline` / `incremental`
- `error`

## 评分规则

满分 100：

- 新鲜度：30
- Google Trends 趋势：25
- 可制作性：15
- SERP 竞争弱度：15
- 变体空间：10
- 风险控制：5

输出建议：

- `70+`: `should_build`
- `50-69`: `observe`
- `<50`: `reject`

## 运行

需要 Node.js 24 或更高版本。

```bash
npm run dev
```

打开：

```text
http://localhost:3002
```

生产环境启动：

```bash
npm run start
```

开启私有访问：

```bash
RADAR_USER=admin RADAR_PASSWORD=your-strong-password npm run dev
```

## 本地校验

```bash
npm run check
```

这个命令会使用模拟 sitemap 跑一遍抓取、URL 过滤、diff、关键词提取和评分，不会访问外部网站。

## 导入词根库

```bash
npm run import-roots
```

导入后打开：

```text
http://localhost:3002/roots
```

Roots 页面用于维护自有词根库。它不是最终机会词列表，而是后续 Trends / Suggest / SERP API 挖掘的种子池。

## 配置站点

系统已经内置 22 个推荐竞品游戏站。打开 `Sites` 页面可以看到“推荐竞品站”区域；如果缺失，可以点击 `Import Missing` 导入。

当前内置站点：

- A: `crazygames.com`
- A: `poki.com`
- A: `y8.com`
- A: `gamepix.com`
- A: `lagged.com`
- B: `miniplay.com`
- B: `coolmathgames.com`
- B: `kizi.com`
- B: `twoplayergames.org`
- B: `1001games.com`
- B: `kevin.games`
- C: `htmlgames.com`
- C: `kiz10.com`
- C: `gameflare.com`
- C: `play-games.com`
- C: `freeonlinegames.com`
- C: `silvergames.com`
- C: `playhop.com`
- C: `gamesgames.com`
- C: `agame.com`
- C: `gamaverse.com`
- C: `gamearter.com`

默认只启用 A 级 5 个站点。Dashboard 和 `Sites` 页面里的 `Enable A+B` 会导入并启用 A/B 主雷达包，C 级站点先保留给实验监控。

方式一：在后台 `Sites` 页面添加：

- `Domain`: 例如 `example-game-site.com`
- `Sitemap URL`: 可留空。留空时系统会尝试读取 `https://domain/robots.txt` 中的 `Sitemap:`。
- `Include Patterns`: 可选，一行一个。为空时不过滤。例如 `/game/*`。
- `Exclude Patterns`: 可选，一行一个。例如 `/category/*`、`/blog/*`、`/tag/*`。
- `Delay ms`: 单站请求间隔，默认 `1200`。
- `Timeout ms`: 单次请求超时，默认 `20000`。
- `Max Sitemap Bytes`: 单个 sitemap 最大读取字节数，默认 `10485760`。
- `Baseline URL Limit`: 单站全量基线最多处理 URL 数，默认 `100000`。
- `Incremental URL Limit`: 单站日常增量最多处理 URL 数，默认 `300`。
- `Max Sitemaps / Run`: 单站单次最多递归子 sitemap 数，默认 `1000`。
- `Enabled`: 勾选后会参与抓取。

过滤规则会同时匹配完整 URL 和 path/query。规则中可以使用 `*` 通配符；不含 `*` 时按普通片段包含匹配。

方式二：使用示例种子站点：

```bash
npm run seed
npm run enable-radar-pack
npm run prune-radar-pack
npm run backfill-keywords
```

## 运行抓取

方式一：后台点击左侧按钮。

- `Run Baseline`: 建立或补充基线，只记录 URL，不生成机会词。
- `Run Incremental`: 日常增量扫描，只对基线之后新出现的 URL 生成机会词。

方式二：命令行手动执行：

```bash
npm run baseline
npm run crawl
npm run backfill-keywords
```

抓取逻辑只读取公开 `robots.txt` 和 `sitemap`，不会读取网页正文，不会绕过限制。默认每次请求间隔约 1.2 秒，递归 sitemap index 深度上限为 4。

第一次使用建议先跑 `Run Baseline`，不要用这批历史库存做选词决策。第二次以后跑 `Run Incremental`，这时出现的新 URL 才是更有参考价值的新游戏信号。

如果某个站点还没有 baseline，即使误点了 `Run Incremental`，系统也会自动按 baseline 处理，不会生成机会词。

每次抓取都会写入 `runs`。Dashboard 会显示基线 URL、今日真实新增 URL、今日新增机会词、发现 URL、匹配 URL、过滤 URL、新增 URL 和更新 URL。如果根 sitemap 失败，站点本次抓取会显示 `failed`；如果某些子 sitemap 失败但仍抓到部分 URL，会显示 `partial` 并保存错误摘要。

如果先发现了增量 URL，后来才修复 URL 解析规则，可以运行 `npm run backfill-keywords`，它会只给缺失关键词的 `incremental` URL 补生成候选词，不会把 baseline 历史库存加入机会队列。

## 定时抓取

可以把 `scripts/crawl-once.sh` 放进本机 cron。示例：每天北京时间 09:15 和 18:15 各抓一次。

```cron
15 9,18 * * * /Users/alex/Documents/New\ project\ 5/scripts/crawl-once.sh >> /Users/alex/Documents/New\ project\ 5/data/crawl.log 2>&1
```

如果使用 macOS，也可以后续迁到 `launchd`。第一阶段建议每天 1-2 次，不要高频抓取。

## 查看结果

- `Dashboard`: 今日新增 URL、今日新增关键词、高优先级关键词、最近抓取记录。
- `New URLs`: 默认查看 `incremental` URL，也可以切换到 `baseline` 或 `all`。
- `Keywords`: 只展示 `incremental` 机会词，不展示基线历史库存。
- `Keyword Detail`: 修改关键词、备注、Google Trends 状态、制作难度、SERP 竞争度、上线状态、上线 URL、收录状态和 7 天曝光/点击复盘。

## 后续迁移建议

- 接入 Google Trends / SERP 的人工录入模板，先半自动化，避免误判。
- 增加历史快照、站点级 sitemap 游标和更细的关键词去重合并规则。
- 部署可参考 [DEPLOYMENT.md](./DEPLOYMENT.md)。
