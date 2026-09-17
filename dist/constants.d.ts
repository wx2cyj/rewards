/**
 * 微软奖励脚本的核心常量文件
 * 定义了整个应用程序中使用的超时、重试限制和其他魔法数字
 */
export declare const TIMEOUTS: {
    readonly SHORT: 500;
    readonly MEDIUM: 1500;
    readonly MEDIUM_LONG: 2000;
    readonly LONG: 3000;
    readonly VERY_LONG: 5000;
    readonly EXTRA_LONG: 10000;
    readonly DASHBOARD_WAIT: 30000;
    readonly LOGIN_MAX: 180000;
    readonly NETWORK_IDLE: 5000;
};
export declare const RETRY_LIMITS: {
    readonly MAX_ITERATIONS: 5;
    readonly DASHBOARD_RELOAD: 2;
    readonly MOBILE_SEARCH: 3;
    readonly ABC_MAX: 15;
    readonly POLL_MAX: 15;
    readonly QUIZ_MAX: 15;
    readonly QUIZ_ANSWER_TIMEOUT: 10000;
    readonly GO_HOME_MAX: 5;
};
export declare const DELAYS: {
    readonly ACTION_MIN: 1000;
    readonly ACTION_MAX: 3000;
    readonly SEARCH_DEFAULT_MIN: 2000;
    readonly SEARCH_DEFAULT_MAX: 5000;
    readonly BROWSER_CLOSE: 2000;
    readonly TYPING_DELAY: 20;
    readonly SEARCH_ON_BING_WAIT: 5000;
    readonly SEARCH_ON_BING_COMPLETE: 3000;
    readonly SEARCH_ON_BING_FOCUS: 200;
    readonly SEARCH_BAR_TIMEOUT: 15000;
    readonly QUIZ_ANSWER_WAIT: 2000;
    readonly THIS_OR_THAT_START: 2000;
};
export declare const SELECTORS: {
    readonly MORE_ACTIVITIES: "#more-activities";
    readonly SUSPENDED_ACCOUNT: "#suspendedAccountHeader";
    readonly QUIZ_COMPLETE: "#quizCompleteContainer";
    readonly QUIZ_CREDITS: "span.rqMCredits";
};
export declare const URLS: {
    readonly REWARDS_BASE: "https://rewards.bing.com";
    readonly REWARDS_SIGNIN: "https://rewards.bing.com/signin";
    readonly APP_USER_DATA: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613";
};
export declare const DISCORD: {
    readonly MAX_EMBED_LENGTH: 1900;
    readonly RATE_LIMIT_DELAY: 500;
    readonly WEBHOOK_TIMEOUT: 10000;
    readonly DEBOUNCE_DELAY: 750;
    readonly COLOR_RED: 16711680;
    readonly COLOR_CRIMSON: 14423100;
    readonly COLOR_ORANGE: 16753920;
    readonly COLOR_BLUE: 3447003;
    readonly COLOR_GREEN: 53866;
    readonly AVATAR_URL: "https://media.discordapp.net/attachments/1421163952972369931/1421929950377939125/Gc.png";
};
export declare const META: {
    readonly C: "aHR0cHM6Ly9kaXNjb3JkLmdnL2tuMzY5NUt4MzI=";
    readonly R: "aHR0cHM6Ly9naXRodWIuY29tL0xpZ2h0NjAtMS9NaWNyb3NvZnQtUmV3YXJkcy1SZXdp";
};
//# sourceMappingURL=constants.d.ts.map