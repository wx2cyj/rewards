import { z } from 'zod';
import { Config } from '../interface/Config';
import { Account } from '../interface/Account';
export declare const ConfigSchema: z.ZodObject<{
    baseURL: z.ZodString;
    sessionPath: z.ZodString;
    headless: z.ZodBoolean;
    clusters: z.ZodNumber;
    errorDiagnostics: z.ZodBoolean;
    ensureStreakProtection: z.ZodBoolean;
    workers: z.ZodObject<{
        doDailySet: z.ZodBoolean;
        doSpecialPromotions: z.ZodBoolean;
        doMorePromotions: z.ZodBoolean;
        doClaimBonusPoints: z.ZodBoolean;
        doPunchCards: z.ZodBoolean;
        doAppPromotions: z.ZodBoolean;
        doDesktopSearch: z.ZodBoolean;
        doMobileSearch: z.ZodBoolean;
        doDailyCheckIn: z.ZodBoolean;
        doReadToEarn: z.ZodBoolean;
    }, z.core.$strip>;
    searchOnBingLocalQueries: z.ZodBoolean;
    globalTimeout: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
    searchSettings: z.ZodObject<{
        scrollRandomResults: z.ZodBoolean;
        clickRandomResults: z.ZodBoolean;
        parallelSearching: z.ZodBoolean;
        queryEngines: z.ZodArray<z.ZodEnum<{
            china: "china";
            google: "google";
            wikipedia: "wikipedia";
            reddit: "reddit";
            local: "local";
        }>>;
        searchResultVisitTime: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        searchDelay: z.ZodObject<{
            min: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
            max: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        }, z.core.$strip>;
        readDelay: z.ZodObject<{
            min: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
            max: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
        }, z.core.$strip>;
        chinaApi: z.ZodOptional<z.ZodObject<{
            appkey: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    debugLogs: z.ZodBoolean;
    proxy: z.ZodObject<{
        queryEngine: z.ZodBoolean;
    }, z.core.$strip>;
    giftCardMonitor: z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        keywords: z.ZodArray<z.ZodString>;
        requireEnoughPoints: z.ZodOptional<z.ZodBoolean>;
        notifyOnce: z.ZodOptional<z.ZodBoolean>;
        shopUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    consoleLogFilter: z.ZodObject<{
        enabled: z.ZodBoolean;
        mode: z.ZodEnum<{
            whitelist: "whitelist";
            blacklist: "blacklist";
        }>;
        levels: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            debug: "debug";
            info: "info";
            warn: "warn";
            error: "error";
        }>>>;
        keywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
        regexPatterns: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    webhook: z.ZodObject<{
        discord: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodBoolean;
            url: z.ZodString;
        }, z.core.$strip>>;
        ntfy: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            url: z.ZodString;
            topic: z.ZodOptional<z.ZodString>;
            token: z.ZodOptional<z.ZodString>;
            title: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
            priority: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>, z.ZodLiteral<4>, z.ZodLiteral<5>]>>;
        }, z.core.$strip>>;
        pushplus: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            token: z.ZodString;
            title: z.ZodOptional<z.ZodString>;
            template: z.ZodOptional<z.ZodEnum<{
                txt: "txt";
                html: "html";
                markdown: "markdown";
            }>>;
            channel: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        wecom: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            corpId: z.ZodString;
            agentId: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
            corpSecret: z.ZodString;
            toUser: z.ZodString;
            proxyMode: z.ZodOptional<z.ZodEnum<{
                direct: "direct";
                qinglong: "qinglong";
            }>>;
            proxyBaseUrl: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        webhookLogFilter: z.ZodObject<{
            enabled: z.ZodBoolean;
            mode: z.ZodEnum<{
                whitelist: "whitelist";
                blacklist: "blacklist";
            }>;
            levels: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                debug: "debug";
                info: "info";
                warn: "warn";
                error: "error";
            }>>>;
            keywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
            regexPatterns: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const AccountSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    totpSecret: z.ZodOptional<z.ZodString>;
    recoveryEmail: z.ZodString;
    geoLocale: z.ZodString;
    langCode: z.ZodString;
    proxy: z.ZodObject<{
        proxyAxios: z.ZodBoolean;
        url: z.ZodString;
        port: z.ZodNumber;
        password: z.ZodString;
        username: z.ZodString;
    }, z.core.$strip>;
    saveFingerprint: z.ZodObject<{
        mobile: z.ZodBoolean;
        desktop: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare function validateConfig(data: unknown): Config;
export declare function validateAccounts(data: unknown): Account[];
export declare function checkNodeVersion(): void;
//# sourceMappingURL=Validator.d.ts.map