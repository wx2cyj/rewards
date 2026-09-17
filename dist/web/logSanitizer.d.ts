export declare function stripAnsi(value: string): string;
export declare function readableLogSnippet(line: string): string;
export declare function formatLogTimestamp(date?: Date): string;
export declare function parseExistingLogTimestamp(line: string): {
    date: Date;
    rest: string;
} | null;
export declare function stampLogLine(line: string, fallbackDate?: Date): string;
//# sourceMappingURL=logSanitizer.d.ts.map