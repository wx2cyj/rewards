import type { WebhookPushPlusConfig } from '../interface/Config';
export declare function sendPushPlus(config: WebhookPushPlusConfig, content: string): Promise<void>;
export declare function flushPushPlusQueue(timeoutMs?: number): Promise<void>;
//# sourceMappingURL=PushPlus.d.ts.map