export default class Util {
    wait(time: number | string): Promise<void>;
    waitRandom(min_ms: number, max_ms: number, distribution?: 'uniform' | 'normal'): Promise<void>;
    getFormattedDate(ms?: number): string;
    shuffleArray<T>(array: T[]): T[];
    randomNumber(min: number, max: number, distribution?: 'uniform' | 'normal'): number;
    chunkArray<T>(arr: T[], numChunks: number): T[][];
    stringToNumber(input: string | number): number;
    normalizeString(string: string): string;
    getEmailUsername(email: string): string;
    randomDelay(min: string | number, max: string | number): number;
}
//# sourceMappingURL=Utils.d.ts.map