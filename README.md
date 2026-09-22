# Microsoft Rewards 自动任务脚本 (Docker 增强版)

基于微软 Rewards 自动化脚本优化，专为 NAS（飞牛 fnOS、群晖 Synology、Unraid、TrueNAS）及 Docker 环境打造。

## 本仓库核心修复与增强特性

1. **自动切换到密码登录页面（关键修复）**：
   - 彻底解决微软登录策略改版问题（微软默认推荐 Passkey / Authenticator 无密码推送 / 邮箱验证码，而将传统密码选项隐藏在二级菜单）。
   - 脚本在检测到非密码界面时，会自动侦测并点击「其他登录方式」 -> 「使用你的密码」，强制回到密码输入框完成无人值守全自动登录。
2. **修复 Bing 会话验证超时与多级重定向**：
   - 自动识别并处理微软新增的 `/fd/auth/signin`、`/identity/idtokenv2` 等身份令牌中间页面，不再出现循环超时死锁。
   - 增强 Cookie 级登录凭证保全与回退判断。
3. **针对现代 Next.js 仪表板的兼容性加固**：
   - 兼容微软新版 Rewards 仪表板（Server Actions 部署与无 RequestVerificationToken 的新架构）。
4. **轻量化 Docker 镜像**：
   - 预编译运行时，镜像体积更小，基于 `node:24-slim` 与 Patchright 专用 Chromium Headless Shell，支持 `linux/amd64` 与 `linux/arm64` 双架构。

---

## 快速使用 (Docker Compose)

在飞牛 NAS 的「Docker」-「项目」或使用 `docker-compose.yml` 部署：

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

直接启动：
```bash
docker compose up -d
```

### Web 控制台界面

容器启动后，在浏览器访问：
```
http://<飞牛NAS的IP>:3000
```
- **首次访问**：提示设置管理员用户名与密码；
- **核心功能**：
  - 实时可视化查看多账号任务进度、历史积分与曲线；
  - 在线管理和增删账号、调整功能开关与 Cron 调度；
  - 在线手动一键触发运行与实时日志流监控。

查看日志：
```bash
docker logs -f rewards
```
