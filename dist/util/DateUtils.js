"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localDateKey = localDateKey;
function localDateKey(date = new Date()) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}
//# sourceMappingURL=DateUtils.js.map