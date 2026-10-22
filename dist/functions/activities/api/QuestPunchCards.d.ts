import { Workers } from '../../Workers';

export declare class QuestPunchCards extends Workers {
    doQuestPunchCards(): Promise<void>;
    private processSingleQuest;
    private claimQuestTask;
}
