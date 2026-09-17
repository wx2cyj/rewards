"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// App
const DailyCheckIn_1 = require("./activities/app/DailyCheckIn");
const ReadToEarn_1 = require("./activities/app/ReadToEarn");
const AppReward_1 = require("./activities/app/AppReward");
// API
const UrlReward_1 = require("./activities/api/UrlReward");
const UrlRewardNew_1 = require("./activities/api/UrlRewardNew");
const Quiz_1 = require("./activities/api/Quiz");
const FindClippy_1 = require("./activities/api/FindClippy");
const DoubleSearchPoints_1 = require("./activities/api/DoubleSearchPoints");
const ClaimBonusPoints_1 = require("./activities/api/ClaimBonusPoints");
const StreakProtection_1 = require("./activities/api/StreakProtection");
// Browser
const SearchOnBing_1 = require("./activities/browser/SearchOnBing");
const Search_1 = require("./activities/browser/Search");
// 活动处理类 - 负责执行各种Microsoft Rewards活动
class Activities {
    constructor(bot) {
        // Browser Activities
        this.doSearch = async (data, page, isMobile, initialMissingPoints) => {
            const search = new Search_1.Search(this.bot);
            return await search.doSearch(data, page, isMobile, initialMissingPoints);
        };
        this.doSearchOnBing = async (promotion, page) => {
            const searchOnBing = new SearchOnBing_1.SearchOnBing(this.bot);
            await searchOnBing.doSearchOnBing(promotion, page);
        };
        /*
        doABC = async (page: Page): Promise<void> => {
            const abc = new ABC(this.bot)
            await abc.doABC(page)
        }
        */
        /*
        doPoll = async (page: Page): Promise<void> => {
            const poll = new Poll(this.bot)
            await poll.doPoll(page)
        }
        */
        /*
        doThisOrThat = async (page: Page): Promise<void> => {
            const thisOrThat = new ThisOrThat(this.bot)
            await thisOrThat.doThisOrThat(page)
        }
        */
        // API Activities
        this.doUrlReward = async (promotion) => {
            const urlReward = new UrlReward_1.UrlReward(this.bot);
            await urlReward.doUrlReward(promotion);
        };
        // 临时解决办法
        this.doDaily = async (promotion) => {
            const urlReward = new UrlRewardNew_1.UrlRewardNew(this.bot);
            await urlReward.doUrlReward(promotion);
        };
        this.doQuiz = async (promotion) => {
            const quiz = new Quiz_1.Quiz(this.bot);
            await quiz.doQuiz(promotion);
        };
        this.doFindClippy = async (promotion) => {
            const findClippy = new FindClippy_1.FindClippy(this.bot);
            await findClippy.doFindClippy(promotion);
        };
        this.doDoubleSearchPoints = async (promotion) => {
            const doubleSearchPoints = new DoubleSearchPoints_1.DoubleSearchPoints(this.bot);
            await doubleSearchPoints.doDoubleSearchPoints(promotion);
        };
        this.doClaimBonusPoints = async () => {
            const claimBonusPoints = new ClaimBonusPoints_1.ClaimBonusPoints(this.bot);
            return claimBonusPoints.claimBonusPoints();
        };
        this.doStreakProtection = async () => {
            const streakProtection = new StreakProtection_1.StreakProtection(this.bot);
            await streakProtection.ensureStreakProtection();
        };
        // App Activities
        this.doAppReward = async (promotion) => {
            const urlReward = new AppReward_1.AppReward(this.bot);
            await urlReward.doAppReward(promotion);
        };
        this.doReadToEarn = async () => {
            const readToEarn = new ReadToEarn_1.ReadToEarn(this.bot);
            await readToEarn.doReadToEarn();
        };
        this.doDailyCheckIn = async () => {
            const dailyCheckIn = new DailyCheckIn_1.DailyCheckIn(this.bot);
            await dailyCheckIn.doDailyCheckIn();
        };
        this.bot = bot;
    }
}
exports.default = Activities;
//# sourceMappingURL=Activities.js.map