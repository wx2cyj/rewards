"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSearchCounter = analyzeSearchCounter;
exports.calculateMissingSearchPoints = calculateMissingSearchPoints;
function numeric(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function statusMessage(label, status) {
    switch (status) {
        case 'missing-counter':
            return `${label} counter missing`;
        case 'empty-counter':
            return `${label} counter empty`;
        case 'invalid-counter':
            return `${label} counter invalid`;
        case 'completed':
            return `${label} completed`;
        case 'ok':
            return `${label} ok`;
    }
}
function emptyInfo(status, label, source, itemCount = 0) {
    return {
        detected: false,
        status,
        message: statusMessage(label, status),
        completed: 0,
        total: 0,
        remaining: 0,
        itemCount,
        source
    };
}
function analyzeSearchCounter(rawItems, label, source = 'dashboard', index) {
    if (rawItems === undefined || rawItems === null) {
        return emptyInfo('missing-counter', label, source);
    }
    if (!Array.isArray(rawItems)) {
        return emptyInfo('invalid-counter', label, source);
    }
    if (rawItems.length === 0) {
        return emptyInfo('empty-counter', label, source);
    }
    const items = index === undefined ? rawItems : rawItems[index] === undefined ? [] : [rawItems[index]];
    if (items.length === 0) {
        return emptyInfo('empty-counter', label, source, rawItems.length);
    }
    let completed = 0;
    let total = 0;
    for (const rawItem of items) {
        const item = rawItem;
        const progress = numeric(item?.pointProgress);
        const progressMax = numeric(item?.pointProgressMax);
        if (progress === null || progressMax === null) {
            return emptyInfo('invalid-counter', label, source, rawItems.length);
        }
        completed += Math.max(0, progress);
        total += Math.max(0, progressMax);
    }
    const remaining = Math.max(0, total - completed);
    const status = remaining > 0 ? 'ok' : 'completed';
    return {
        detected: true,
        status,
        message: statusMessage(label, status),
        completed,
        total,
        remaining,
        itemCount: rawItems.length,
        source
    };
}
function calculateMissingSearchPoints(counters, isMobile, source = 'dashboard', availability) {
    const safeCounters = (counters ?? {});
    const counterValue = (key, status) => {
        if (status === 'missing' || status === 'fallback')
            return undefined;
        if (status === 'empty')
            return [];
        if (status === 'invalid')
            return {};
        return safeCounters[key];
    };
    const mobileItems = counterValue('mobileSearch', availability?.mobileSearch);
    const pcItems = counterValue('pcSearch', availability?.pcSearch);
    const mobileCounter = analyzeSearchCounter(mobileItems, 'mobileSearch', source);
    const desktopCounter = analyzeSearchCounter(pcItems, 'pcSearch[0]', source, 0);
    const edgeCounter = analyzeSearchCounter(pcItems, 'pcSearch[1]', source, 1);
    const mobilePoints = mobileCounter.status === 'ok' ? mobileCounter.remaining : 0;
    const desktopPoints = desktopCounter.status === 'ok' ? desktopCounter.remaining : 0;
    const edgePoints = edgeCounter.status === 'ok' ? edgeCounter.remaining : 0;
    const totalPoints = isMobile ? mobilePoints : desktopPoints + edgePoints;
    return {
        mobilePoints,
        desktopPoints,
        edgePoints,
        totalPoints,
        mobileDetected: mobileCounter.detected,
        mobileStatus: mobileCounter.status,
        mobileMessage: mobileCounter.message,
        mobileCounter,
        desktopCounter,
        edgeCounter,
        counterKeys: Object.keys(safeCounters).sort(),
        source
    };
}
//# sourceMappingURL=SearchCounter.js.map