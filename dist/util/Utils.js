"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ms_1 = __importDefault(require("ms"));
class Util {
    async wait(time) {
        if (typeof time === 'string') {
            time = this.stringToNumber(time);
        }
        return new Promise(resolve => {
            setTimeout(resolve, time);
        });
    }
    async waitRandom(min_ms, max_ms, distribution = 'uniform') {
        return new Promise((resolve) => {
            setTimeout(resolve, this.randomNumber(min_ms, max_ms, distribution));
        });
    }
    getFormattedDate(ms = Date.now()) {
        const today = new Date(ms);
        const month = String(today.getMonth() + 1).padStart(2, '0'); //  一月是0
        const day = String(today.getDate()).padStart(2, '0');
        const year = today.getFullYear();
        return `${month}/${day}/${year}`;
    }
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const a = array[i];
            const b = array[j];
            if (a === undefined || b === undefined)
                continue;
            array[i] = b;
            array[j] = a;
        }
        return array;
    }
    randomNumber(min, max, distribution = 'uniform') {
        if (distribution === 'uniform') {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        // 正态分布实现 (Box-Muller变换)
        let u = 0, v = 0;
        while (u === 0)
            u = Math.random();
        while (v === 0)
            v = Math.random();
        let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        num = num / 10.0 + 0.5; // 标准化到0-1范围
        if (num > 1 || num < 0)
            num = this.randomNumber(min, max, distribution); // 边界处理
        return Math.floor(num * (max - min + 1)) + min;
    }
    chunkArray(arr, numChunks) {
        const chunkSize = Math.ceil(arr.length / numChunks);
        const chunks = [];
        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize);
            chunks.push(chunk);
        }
        return chunks;
    }
    stringToNumber(input) {
        if (typeof input === 'number') {
            return input;
        }
        const value = input.trim();
        const milisec = (0, ms_1.default)(value);
        if (milisec === undefined) {
            throw new Error(`The input provided (${input}) cannot be parsed to a valid time! Use a format like "1 min", "1m" or "1 minutes"`);
        }
        return milisec;
    }
    normalizeString(string) {
        return string
            .normalize('NFD')
            .trim()
            .toLowerCase()
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/[?!]/g, '');
    }
    getEmailUsername(email) {
        return email.split('@')[0] ?? 'Unknown';
    }
    randomDelay(min, max) {
        const minMs = typeof min === 'number' ? min : this.stringToNumber(min);
        const maxMs = typeof max === 'number' ? max : this.stringToNumber(max);
        return Math.floor(this.randomNumber(minMs, maxMs));
    }
}
exports.default = Util;
//# sourceMappingURL=Utils.js.map