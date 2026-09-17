import { Workers } from '../../Workers';
export declare class StreakProtection extends Workers {
    /**
     * 启用连击保护（Streak Protection）。
     *
     * 新版 UI（modern dashboard）下走 Next.js Server Action：
     *   POST https://rewards.bing.com/dashboard
     *   next-action: <toggleStreakProtection hash>
     *   body: [true]  // 服务端幂等，已开启再调用也无害
     * 认证靠 Cookie，无需 requestToken / accessToken。
     * 部署版本不匹配时降级跳过（不会 400），旧版 UI 仍走原 REST API。
     */
    ensureStreakProtection(): Promise<void>;
}
//# sourceMappingURL=StreakProtection.d.ts.map