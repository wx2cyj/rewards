# 🐳 NAS 部署与多实例避坑指南

> 适用环境：飞牛 fnOS、群晖 Synology、Unraid、TrueNAS 等 Docker 环境
> 仓库根目录的 `docker-compose.yml` 是**最小可用配置**；本文给出**生产加固版**，并记录实际部署中踩过的坑。
> 文中所有结论均标注了代码出处（`文件:行号`），可自行核对。

---

## 一、生产加固版 docker-compose.yml

```yaml
services:
  rewards:
    image: ghcr.io/wx2cyj/rewards:latest
    container_name: rewards
    restart: unless-stopped

    # 可选保险：Chromium 由 Patchright 启动，已默认注入 --disable-dev-shm-usage，此项非必需（详见第二节）
    shm_size: "1gb"

    environment:
      # ───── 基础 ─────
      TZ: "Asia/Shanghai"
      NODE_ENV: "production"

      # ───── 调度 ─────
      CRON_SCHEDULE: "0 9,15 * * *"   # 每天 09:00 / 15:00
      RUN_ON_START: "false"           # 容器启动是否立刻跑一次
      SKIP_RANDOM_SLEEP: "true"       # NAS 定时场景建议跳过随机延迟

      # ───── 账号：想用 WebUI 管理，就一个 ACCOUNT_* 都不要写 ─────
      # ACCOUNT_1_EMAIL: "your_email@outlook.com"
      # ACCOUNT_1_PASSWORD: "your_password"
      # ACCOUNT_1_TOTP_SECRET: "Base32密钥，开了2FA才填"

      # ───── 功能开关 ─────
      CONFIG_DEBUG_LOGS: "true"
      CONFIG_ENSURE_STREAK_PROTECTION: "true"
      CONFIG_WORKER_DAILY_SET: "true"
      CONFIG_WORKER_CLAIM_BONUS_POINTS: "true"
      CONFIG_WORKER_DESKTOP_SEARCH: "true"
      CONFIG_WORKER_MOBILE_SEARCH: "true"
      CONFIG_WORKER_DAILY_CHECKIN: "true"
      CONFIG_WORKER_READ_TO_EARN: "true"
      CONFIG_WORKER_SPECIAL_PROMOTIONS: "true"
      CONFIG_WORKER_MORE_PROMOTIONS: "true"
      CONFIG_WORKER_PUNCH_CARDS: "true"
      CONFIG_WORKER_APP_PROMOTIONS: "true"

      # ───── 运行日志持久化 ─────
      RUNTIME_LOG_FILE: "/usr/src/microsoft-rewards-script/logs/runtime.log"

      # ───── 可选：用环境变量预设管理员，跳过首次初始化窗口期 ─────
      # WEB_ADMIN_USER: "admin"
      # WEB_ADMIN_PASSWORD: "至少8位的强密码"

    ports:
      # 容器内固定 3000，只改左边宿主机端口
      - "3000:3000"

    volumes:
      - /vol1/1000/docker/rewards/sessions:/usr/src/microsoft-rewards-script/dist/browser/sessions
      - /vol1/1000/docker/rewards/config:/usr/src/microsoft-rewards-script/dist/config
      - /vol1/1000/docker/rewards/logs:/usr/src/microsoft-rewards-script/logs

    # 镜像本身没有 HEALTHCHECK，用免鉴权的 /api/bootstrap 探活
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get({host:'127.0.0.1',port:3000,path:'/api/bootstrap',timeout:4000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 120s

    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "3"
```

### 与仓库官方版的差异

| 项 | 官方版 | 加固版 | 原因 |
| :--- | :--- | :--- | :--- |
| `shm_size` | 无 | `1gb`（可选保险） | Patchright 已默认注入 `--disable-dev-shm-usage`，`/dev/shm` 不是瓶颈；留着只为兜底 |
| `logs/` 挂载 | 无 | 有 | 积分历史、断点续跑、任务进度都存在容器内，不挂载重启即丢 |
| `RUNTIME_LOG_FILE` | 默认 `/var/log/...` | 指到 `logs/` | 运行日志随容器重建丢失 |
| `healthcheck` | 无 | 有 | 镜像未内置 `HEALTHCHECK` |
| `logging` 轮转 | 无 | 20m × 3 | 防止长期运行把宿主机日志撑爆 |
| 卷路径 | 相对路径 `./config` | **绝对路径** | 飞牛 Compose 项目后台工作目录会切换，相对路径易挂到错误位置 |

---

## 二、几个必须知道的机制

### 2.1 `/dev/shm` 与 `shm_size` —— 本项目**不需要**

网上常见经验是「Chromium 在容器里会因 `/dev/shm` 只有 64MB 而崩溃，必须加 `shm_size: 1gb`」。**这个结论对本项目不成立**，实测过程如下：

1. 项目自身的启动参数（`dist/browser/Browser.js:129-143` 的 `BROWSER_ARGS`）确实**没有** `--disable-dev-shm-usage`；
2. 但底层由 **Patchright**（Playwright 衍生版）负责拉起 Chromium，而它的内置默认参数里**已经包含** `--disable-dev-shm-usage`（`node_modules/patchright-core/lib/coreBundle.js:34846`）；
3. 最终以实际运行的进程为准 —— 容器跑任务时执行：

```bash
docker exec rewards ps aux | grep chrome-headless-shell
```

命令行里可以看到 `--disable-dev-shm-usage`，说明 Chromium 的共享内存走 `/tmp` 而非 `/dev/shm`，64MB 的 `/dev/shm` 不会成为瓶颈。

**结论**：`shm_size` 属于**可选的保险措施**，不是必需项。本文示例仍保留 `shm_size: "1gb"`，因为 tmpfs 按需分配、几乎不占实际内存，留着没有坏处；想省掉也完全可以。

> 真正容易导致「任务跑到一半崩溃 / 容器 `exit 137`」的，通常是**容器内存不足被 OOM kill**。排查先看：
> ```bash
> docker inspect rewards --format '{{.State.OOMKilled}}'    # true 即内存不足
> docker stats --no-stream rewards
> ```

### 2.2 账号：环境变量与 WebUI **二选一，不能混用**

`scripts/docker/entrypoint.sh:109-117` 的逻辑是：

1. 只要 env 里存在 `ACCOUNT_N_EMAIL`，容器**每次启动**都会用 env 重新生成 `dist/config/accounts.json`；
2. 只有 env 里一个账号都没有时，才会复用已挂载的 `accounts.json`。

**后果**：如果你在 compose 里写了 `ACCOUNT_1_EMAIL`，又在 WebUI 里增删账号，**下次重启容器，WebUI 里改的内容会被 env 静默覆盖**。

两种用法二选一：

| 方式 | 做法 | 适合场景 |
| :--- | :--- | :--- |
| **A. 全 env** | compose 里写 `ACCOUNT_1_*` 等，WebUI 只看不改 | 账号固定、想用配置文件版本化管理 |
| **B. 全 WebUI**（推荐） | compose 里**一个 `ACCOUNT_*` 都不写**，账号全在 WebUI 维护 | 密码不落明文、随时增删账号 |

另外，**编号必须从 1 连续**：`entrypoint.sh:87-91` 是 `while true` 递增，**遇到第一个空的 `ACCOUNT_N_EMAIL` 立即 `break`**。所以配了 `ACCOUNT_1` 和 `ACCOUNT_3` 而缺 `ACCOUNT_2` 时，第 3 个账号会被整体忽略。

### 2.3 定时任务有两个"真相源"

| 调度器 | 读取来源 |
| :--- | :--- |
| 系统 `cron` | 启动时由 `CRON_SCHEDULE` 渲染 `/etc/cron.d/...` |
| Node 内置调度引擎 | 优先读 `config/schedule.json`（在 WebUI 里改过时间就会生成） |

如果两处不一致，会出现"有时按新时间跑、有时按旧时间跑"，甚至两个调度器互抢锁、日志反复打印 `已有任务正在运行中，本次定时触发跳过`。

**建议**：定时时间只在**一处**维护。改了 WebUI 的时间，就同步改 compose 的 `CRON_SCHEDULE` 再重启容器。

### 2.4 执行耗时调优：搜索 / 阅读间隔

镜像默认参数是**非常保守**的：

| 参数 | 默认值 | 含义 |
| :--- | :--- | :--- |
| `searchSettings.searchDelay` | `6min` ~ `12min` | 每次搜索之间的等待 |
| `searchSettings.readDelay` | `6min` ~ `11min` | 每篇资讯阅读之间的等待 |
| `searchSettings.searchResultVisitTime` | `20sec` | 搜索结果页停留时长 |

按默认值，单账号每天 20 次搜索 × 平均 9 分钟 ≈ **2~3 小时**才能跑完一轮。若按 `0 9,15 * * *` 一天跑两次，上午那轮可能拖到下午，与 15:00 的调度互相挤压（后者会因锁被占用而跳过）。

**推荐的加速参数**（实测单轮压缩到 **10~15 分钟**）：

```yaml
environment:
  CONFIG_SEARCH_DELAY_MIN: "25sec"
  CONFIG_SEARCH_DELAY_MAX: "60sec"
  CONFIG_SEARCH_READ_DELAY_MIN: "20sec"
  CONFIG_SEARCH_READ_DELAY_MAX: "45sec"
  CONFIG_SEARCH_VISIT_TIME: "8sec"
```

对应的 `CONFIG_*` → `config.json` 映射（`scripts/docker/entrypoint.sh:181-190`）：

| 环境变量 | 配置路径 |
| :--- | :--- |
| `CONFIG_SEARCH_DELAY_MIN` / `_MAX` | `.searchSettings.searchDelay.min` / `.max` |
| `CONFIG_SEARCH_READ_DELAY_MIN` / `_MAX` | `.searchSettings.readDelay.min` / `.max` |
| `CONFIG_SEARCH_VISIT_TIME` | `.searchSettings.searchResultVisitTime` |
| `CONFIG_SEARCH_SCROLL_RANDOM` / `_CLICK_RANDOM` | `.searchSettings.scrollRandomResults` / `.clickRandomResults` |
| `CONFIG_SEARCH_PARALLEL` | `.searchSettings.parallelSearching` |
| `CONFIG_SEARCH_ON_BING_LOCAL` | `.searchOnBingLocalQueries` |

> ⚠️ **别调得过猛**：间隔压到 10 秒以内会显著提高被风控审计的概率。`25~60 秒` 是速度与安全之间比较稳妥的平衡点；`20 秒` 建议作为下限。

### 2.5 消息推送（企业微信 / Discord / ntfy / PushPlus）

推送配置**不在环境变量里**，而是保存在 `config/config.json` 的 `webhook` 节点，WebUI 的「企业微信推送」页保存的也是同一处：

```json
{
  "webhook": {
    "wecom": {
      "enabled": true,
      "corpId": "ww***********",
      "agentId": "1000002",
      "corpSecret": "***********",
      "toUser": "@all",
      "proxyMode": "direct",
      "proxyBaseUrl": ""
    },
    "discord": { "enabled": false },
    "ntfy": { "enabled": false },
    "pushplus": { "enabled": false }
  }
}
```

几个要点：

1. **必须挂载 `dist/config`**，否则容器重建后推送配置全部丢失；
2. `webhook.wecom` 里的 `corpSecret` 是**明文**，`config.json` 请一并收紧到 `600`；
3. `proxyMode` / `proxyBaseUrl` 用于让容器经一个中转地址访问企业微信接口（当 NAS 所在网络访问腾讯 API 不稳定时很有用）。**注意中转地址必须是本机能访问到的**——如果填的是另一套部署所在内网的地址，跨机房就发不出去；
4. 多实例场景：每个实例的推送是**独立**的，各自跑完各自发。若两套实例都推同一个群，消息会翻倍，按需只开一套或配不同 `toUser`；
5. 推送在**每轮任务结束时**触发一次，想单独验证渠道是否通畅，可在 WebUI 的推送设置页点「测试」。

---

## 三、首次初始化与管理员账号

- 镜像**没有内置默认账号**，首次访问 WebUI 会强制进入初始化页（`首次启动设置`）；
- 校验规则：用户名 ≥ 3 位、密码 ≥ 8 位；
- 密码用 **PBKDF2-SHA256 / 120000 轮** 加盐哈希后写入 `config/web-auth.json`（`dist/web/server.js:304-316`）；
- 想跳过初始化页，有两种方式：
  - **环境变量预设**：设置 `WEB_ADMIN_USER` + `WEB_ADMIN_PASSWORD`。此方式**优先级高于文件**（`server.js:322-332`），每次启动按 env 计算哈希；
  - **挂载已有文件**：把另一套实例的 `config/web-auth.json` 直接拷过来，即可复用同一套管理员账号密码（哈希自带 salt，跨机器可用）。

> ⚠️ **安全提醒**：初始化完成前，任何能访问到该端口的人都可以**抢先把自己设成管理员**。生产环境（尤其公司内网）请务必：
> - 用 SSH 隧道只在本机访问：`ssh -L 3001:127.0.0.1:3001 root@你的NAS`，然后开 `http://127.0.0.1:3001`；
> - 或先用防火墙 / 反代限制来源 IP，再打开浏览器；
> - 或直接用 `WEB_ADMIN_USER` / `WEB_ADMIN_PASSWORD` 预设，从根上消除这个窗口期。

---

## 四、多实例部署（例如：家里一台 + 公司一台）

同一镜像可以跑任意多套，但以下四项**必须全部错开**：

| 项 | 要求 |
| :--- | :--- |
| `container_name` | 不同（否则 Docker 直接报名字冲突） |
| 宿主机端口 | 不同（容器内始终是 3000，只改映射左侧） |
| 宿主机目录 | 不同（`config` / `sessions` / `logs` 各自独立） |
| Compose 项目目录 | 不同（`docker compose down` 按项目名生效，同目录会互相误伤） |

> ⚠️ **`sessions/` 是登录凭证（Cookie），绝对不要在两套实例间共享或复制**。同一个账号在两处用不同浏览器上下文登录，会互相顶号、触发微软风控。
>
> ⚠️ **同一批微软账号不要在两个不同公网 IP 上同时跑**：会互抢每日搜索额度，并显著提高账号被风控审计的概率。多实例请配套不同的账号。

---

## 五、持久化目录一览

| 容器内路径 | 内容 | 是否必须挂载 |
| :--- | :--- | :--- |
| `dist/config` | `config.json`、`accounts.json`、`schedule.json`、`web-auth.json` | ✅ **必须**。不挂则重启后管理员密码、账号、任务开关、推送配置全丢 |
| `dist/browser/sessions` | 各账号的浏览器登录会话（Cookie） | ✅ **必须**。不挂则每次重启都要重新登录全部账号 |
| `logs` | `YYYY-MM-DD.log`、`points-history.json`、`run-checkpoint.json`、`task-progress.json` 等 | ⭕ 建议。不挂则积分曲线、断点续跑状态丢失 |
| `diagnostics` | 开启 `errorDiagnostics` 后的失败现场（截图 / HTML / 错误文本） | ⭕ 可选，排障用 |

> **不要**挂载整个 `dist/`，也**不要**单独挂 `dist/config.json` 或 `dist/accounts.json`——镜像里这两个是**符号链接**，指向 `dist/config/` 下的真实文件（`Dockerfile` 中 `ln -s`）。挂错会导致 WebUI 改动"重启就回退"。

---

## 六、安全注意事项

1. **`accounts.json` 里是明文密码和明文 TOTP 密钥**，务必收紧权限：

```bash
chmod 700 /path/to/rewards/config
chmod 600 /path/to/rewards/config/*.json
```

2. 该目录**不要**放进 NAS 的共享文件夹 / 网盘同步 / 快照外发范围。
3. 提交代码到公开仓库前，确认 `.gitignore` 已排除 `dist/config/*.json`、`sessions/`、`logs/`、`web-auth.json`。

---

## 七、日常维护

```bash
# 更新镜像（本镜像只有 latest 一个 tag）
cd /path/to/rewards && docker compose pull && docker compose up -d

# 看容器状态（含健康检查）
docker ps --filter name=rewards
docker inspect rewards --format 'Health={{.State.Health.Status}}'

# 看启动日志
docker logs -f --tail=100 rewards

# 看任务运行明细（需按本文挂载 logs 并设置 RUNTIME_LOG_FILE）
docker exec -it rewards tail -n 200 /usr/src/microsoft-rewards-script/logs/runtime.log
```

- 镜像**仅支持 `linux/amd64`**（`.github/workflows/docker.yml` 中 `platforms: linux/amd64`），ARM 架构的 NAS 会直接报 `no matching manifest`；
- 端口可用 `WEB_UI_PORT`（优先）或 `PORT` 覆盖，监听地址可用 `WEB_UI_HOST`（默认 `0.0.0.0`）覆盖；**改容器内端口时记得同步改 healthcheck 与端口映射右侧**，一般只改宿主机侧更省事；
- 代理注意：代码**不读取** `HTTPS_PROXY` / `HTTP_PROXY` 等系统代理环境变量，只能按账号配置 `ACCOUNT_N_PROXY_URL` / `_PORT` / `_USERNAME` / `_PASSWORD`（一旦填写，浏览器与 API 请求都会走该代理；`ACCOUNT_N_PROXY_AXIOS` 只额外控制 API 这一路）。

---

## 八、坑点速查表

| # | 现象 | 根因 | 处理 |
| :--- | :--- | :--- | :--- |
| 1 | 任务跑到一半崩溃 / 容器 `exit 137` | 多数是**容器内存不足被 OOM kill**，而非 `/dev/shm`（`--disable-dev-shm-usage` 已由 Patchright 默认注入） | `docker inspect rewards --format '{{.State.OOMKilled}}'` 确认为 true 则加大内存或降低 `clusters` 并发 |
| 2 | WebUI 里加的账号，重启后消失 | compose 里有 `ACCOUNT_1_EMAIL`，env 覆盖了文件 | env / WebUI 二选一 |
| 3 | 配了 3 个账号只跑 2 个 | 编号断号，`break` 提前退出 | 编号从 1 连续 |
| 4 | 重启后管理员密码/配置全丢 | `dist/config` 未挂载或挂错 | 只挂 `dist/config` 目录本身 |
| 5 | 每次重启都要重新登录所有账号 | `sessions` 未挂载 | 挂载 `dist/browser/sessions` |
| 6 | 积分曲线 / 断点续跑状态丢失 | `logs` 未挂载 | 挂载 `logs` 并设 `RUNTIME_LOG_FILE` |
| 7 | 到点不跑，日志反复提示"已有任务正在运行中" | 双调度器时间不一致 + 陈旧锁 | 定时时间只在一处维护 |
| 8 | 设了 `HTTPS_PROXY` 完全没效果 | 代码不读系统代理变量 | 按账号配 `ACCOUNT_N_PROXY_*` |
| 9 | ARM NAS 拉取报 `no matching manifest` | 镜像仅 amd64 | 换 x86_64 设备 |
| 10 | 挂载点写成 `./config` 后配置不生效 | Compose 后台工作目录变化 | 一律用绝对路径 |
