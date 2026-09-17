import type { WebhookWeComConfig } from '../interface/Config';
export declare function sendWeCom(config: WebhookWeComConfig, content: string): Promise<void>;
export declare function testWeCom(config: WebhookWeComConfig): Promise<void>;
export declare function diagnoseWeCom(config: WebhookWeComConfig): Promise<{
    ok: boolean;
    message: string;
}>;
export declare function flushWeComQueue(timeoutMs?: number): Promise<void>;
//# sourceMappingURL=WeCom.d.ts.map