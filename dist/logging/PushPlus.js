"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushPlus = sendPushPlus;
exports.flushPushPlusQueue = flushPushPlusQueue;
const axios_1 = __importDefault(require("axios"));
const p_queue_1 = __importDefault(require("p-queue"));
const pushPlusQueue = new p_queue_1.default({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
});
async function sendPushPlus(config, content) {
    if (!config?.token)
        return;
    const request = {
        method: 'POST',
        url: 'https://www.pushplus.plus/send',
        headers: { 'Content-Type': 'application/json' },
        data: {
            token: config.token,
            title: config.title,
            content,
            template: config.template,
            channel: config.channel
        },
        timeout: 10000
    };
    await pushPlusQueue.add(async () => {
        try {
            await (0, axios_1.default)(request);
        }
        catch (err) {
            const status = err?.response?.status;
            if (status === 429)
                return;
        }
    });
}
async function flushPushPlusQueue(timeoutMs = 5000) {
    await Promise.race([
        (async () => {
            await pushPlusQueue.onIdle();
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('pushplus刷新超时')), timeoutMs))
    ]).catch(() => { });
}
//# sourceMappingURL=PushPlus.js.map