# 🎁 Microsoft Rewards 自动任务脚本 (Docker 增强版)

基于微软 Rewards 自动化脚本重构优化，专为 NAS（飞牛 fnOS、群晖 Synology、Unraid、TrueNAS）及各类 Linux 服务器与 Docker 环境打造。  
配备全新 **深色 Fluent 毛玻璃控制台**、**独家桌面应用每周专属任务 (+70分/周)**、**百度官方实时热榜保底**、**全自动账密/2FA无人值守登录** 与 **Patchright 真实指纹反爬引擎**。

[![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED.svg?logo=docker&logoColor=white)](https://github.com/wx2cyj/rewards/pkgs/container/rewards)
[![Node.js](https://img.shields.io/badge/Node.js-24+-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-GPL--3.0-green.svg)](https://opensource.org/licenses/GPL-3.0)

---

## ✨ 核心特性与独家优势

1. 🔑 **全自动账密与 2FA 无人值守登录（核心王牌，无需人工抓取 Cookie）**：
   - 彻底解决微软登录策略改版问题（微软默认推荐 Passkey / Authenticator 无密码推送 / 邮箱验证码，而将传统密码选项隐藏在二级菜单）。
   - 脚本在检测到非密码界面时，自动侦测并点击「其他登录方式」 -> 「使用你的密码」，强制回到密码输入框完成全自动无人值守登录。
   - 支持多级重定向与 Bing 会话令牌保全，支持 2FA TOTP 自动计算。
2. 🖥️ **独家支持：桌面应用每周专属任务（每周稳拿额外 +70 积分）**：
   - 自动识别并伪装微软官方桌面客户端（MSRewards Desktop App）专享特征头（`MSRewards/Desktop/1.4.56` + `X-MSRewards-App: 1`）；
   - 逆向全自动解锁并打卡每周专享打孔卡（`WW_pcparent_RewardsApp_weekly_Exclusive`），每周稳拿 70 积分。
3. 📊 **全新现代 Fluent 深浅毛玻璃 Web 控制台 (Glassmorphism)**：
   - **深色星空科技感设计**：采用暗夜紫蓝渐变与 20px 磨砂玻璃卡片，支持 **💻跟随系统 / 🌙深色模式 / ☀️浅色模式** 一键切换；
   - **五核 Hero 核心指标大屏**：实时可视化展示「今日增加积分」、「当前总积分余额」、「任务达成率」、「托管账号数」与「系统运行状态」；
   - **📈 7 日 / 30 日积分增长动态历史趋势柱状图**：动态查看各周期内每日积分到账收益与结余；
   - **微光渐变进度条**：各任务独立卡片与动态蓝光微光进度条展示；
   - **在线管理**：可视化管理多账号、调整任务开关、配置企业微信推送与实时日志流监控。
4. 🔍 **直连百度官方移动端免 Key 实时热榜保底**：
   - 本地新增直连百度官方移动端免 Key 实时热搜榜（`top.baidu.com`），彻底解决第三方聚合平台 403 限流导致回退到英文词库的痛点，确保搜索内容永远为当天国内最新时事热点。
5. 🛡️ **底层抗风控：Patchright + 真实浏览器指纹注入 + 贝塞尔曲线鼠标轨迹**：
   - 基于 Patchright（反爬增强版 Playwright）配合真实硬件级指纹发生器与注入器，模拟真实人类鼠标移动（贝塞尔曲线与抖动），底层防检测能力远超常规无头浏览器。
6. ⚡ **轻量极速构建**：
   - 镜像专为主流 `linux/amd64` 平台深度精简优化，基于 `node:24-slim` 与 Patchright 专用 Chromium Headless Shell，构建与更新极速完成。

---

## 📋 任务支持清单与积分对应

| 任务类型 | 支持状态 | 对应积分 | 说明 |
| :--- | :---: | :---: | :--- |
| **PC 必应搜索** | ✅ 已支持 | +60 积分/天 | 自动调用国内热搜词，拟人间隔防风控 |
| **移动端必应搜索** | ✅ 已支持 | +30 积分/天 | 自动模拟移动设备执行检索 |
| **每日双端签到** | ✅ 已支持 | +10 ~ 50 积分 | 模拟 BingSapphire 移动端 + Web 网页端连续签到 |
| **新闻资讯自动阅读** | ✅ 已支持 | +30 积分/天 | 自动通过 DAPI 阅读新闻资讯（满额 30 分） |
| **日常活动集 (Daily Set)** | ✅ 已支持 | +30 ~ 50 积分/天 | 自动完成每日 3 项日常活动（测验 / 投票 / 卡片） |
| **🖥️ 桌面应用每周专属打孔卡** | ✅ **独家支持** | **+70 积分/周** | **伪装官方桌面客户端特征，每周拿满 70 分打孔卡** |
| **连击保护 (Streak Protection)** | ✅ 已支持 | 保持连签 | 自动通过 Server Action 检查并开启连签保护 |
| **礼品卡库存监控** | ✅ 已支持 | 自动告警 | 监控京东卡、必胜客等礼品卡库存状态 |

---

## 🚀 快速使用 (Docker Compose)

在飞牛 NAS 的「Docker」-「项目」或群晖/Unraid/Linux 服务器上使用 `docker-compose.yml` 部署：

```yaml
services:
  rewards:
    image: ghcr.io/wx2cyj/rewards:latest
    container_name: rewards
    restart: unless-stopped
    environment:
      TZ: "Asia/Shanghai"
      NODE_ENV: "production"
      CRON_SCHEDULE: "0 9,15 * * *"    # 每天早晨 9:00 与下午 15:00 执行各一次
      RUN_ON_START: "true"          # 容器启动时立即执行一次
      SKIP_RANDOM_SLEEP: "true"     # 是否跳过随机延迟

      # 账号1
      ACCOUNT_1_EMAIL: "your_email_1@outlook.com"
      ACCOUNT_1_PASSWORD: "your_password_1"

      # 账号2 (如有)
      ACCOUNT_2_EMAIL: "your_email_2@outlook.com"
      ACCOUNT_2_PASSWORD: "your_password_2"

      # 账号3 (如有)
      ACCOUNT_3_EMAIL: "your_email_3@outlook.com"
      ACCOUNT_3_PASSWORD: "your_password_3"

    ports:
      - "3000:3000"  # Web 控制台端口

    volumes:
      - ./sessions:/usr/src/microsoft-rewards-script/dist/browser/sessions
      - ./config:/usr/src/microsoft-rewards-script/dist/config
```

启动命令：
```bash
docker compose up -d
```

---

## 💻 Web 控制台界面

容器启动后，在浏览器访问：
```
http://<服务器或NAS的IP>:3000
```
* **首次访问**：提示设置管理员账号与密码（凭据仅保存在本机持久化目录）；
* **核心功能**：
  * **Hero 数据大屏**：直观查看今日新增积分、总积分余额与任务达成率；
  * **历史趋势图**：7 日 / 30 日动态柱状图明细分析；
  * **多账号管理**：在线增删改查多账号与一键登录状态检测；
  * **功能配置**：在线开关具体任务（包括桌面专享任务、PC搜索、阅读等）；
  * **消息推送**：集成企业微信 Webhook 实时打卡推送。

查看容器实时日志：
```bash
docker logs -f rewards
```

---

## 📝 更新日志 (Changelog)

### [v3.2.1] - 2026-10-20
- 🛡️ **彻底解决搜索阶段超时死锁与卡死挂起问题**：
  - 重构 `runSearchStage` 超时机制：超时触发时立即同步 `reject`，绝不阻塞等待 `page.close()`；
  - 移除了超时后危险的 `await operationPromise` 二次阻塞挂起反模式；
  - 异步清理页面增加超时限制（3s），避免底层 CDP 连接卡死拖垮整个流程。
- 🌐 **随机点击结果安全加固与防冻结**：
  - 为随机点击链接增加 `noWaitAfter: true` 与独立短超时守护，避免因第三方未知网页弹窗、下载或重定向导致的长时间阻塞；
  - 增加自动化 `dialog.dismiss()` 监听器，防止被网页弹窗冻结。
- ⚙️ **双重调度器与陈旧锁清理机制彻底修复**：
  - 统一 `run_daily.sh`（原 8 小时）与 `server.js`（原 2 小时）的卡死判定阈值均为 2 小时；
  - 强化卡死进程自愈清理：不仅杀死当前 PID，同时杀死进程组及残留孤儿 node / chrome 进程；
  - 修复 `crontab.template`、`check-browser.js` 与 `run_daily.sh` 的 `PLAYWRIGHT_BROWSERS_PATH` 环境变量，彻底消除 cron 环境下误报缺少 Chromium 的问题。

### [v3.2.0] - 2026-10-13
- 🚀 **新增「桌面应用每周专属任务」全自动打卡**：逆向官方客户端特征头与打孔卡机制，每周全自动多拿 70 积分；
- 🎨 **全新 Fluent 毛玻璃 Web 控制台**：重构深浅双模式设计系统，引入五核 Hero 大屏看板与 7/30 天历史积分增长趋势柱状图；
- 🔍 **新增百度官方移动端免 Key 实时热榜保底**：彻底避免第三方热榜 API 限流后回退到英文词库的问题；
- ⚡ **精简构建架构**：移除了跨架构 QEMU 模拟，CI/CD 镜像构建耗时从 6 分钟降至 40 秒左右。

### [v3.1.6] - 2026-09-30
- 🛠️ 统一 GHCR 镜像维护规范与安全清理策略；
- 修复无任务时正常退出逻辑与 2 小时陈旧锁自动清理机制。
