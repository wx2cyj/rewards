"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_SERVER_ACTION_HASHES = exports.KNOWN_SERVER_ACTION_DEPLOYMENT_IDS = void 0;
exports.isKnownServerActionDeployment = isKnownServerActionDeployment;
exports.extractDeploymentIdFromHtml = extractDeploymentIdFromHtml;
exports.extractScriptUrls = extractScriptUrls;
exports.extractServerActionHashesFromSources = extractServerActionHashesFromSources;
exports.extractServerActionHashResultFromSources = extractServerActionHashResultFromSources;
exports.KNOWN_SERVER_ACTION_DEPLOYMENT_IDS = new Set(['20260612-3', '20260626-1', '20260701-3']);
exports.FALLBACK_SERVER_ACTION_HASHES = {
    toggleStreakProtection: '40eddd39784c87de1e9c077e72117f3ed9a016a2d2',
    claimBonusPoints: '00cf5ba7699f0e920ffcff223f9e48fea78fd49784'
};
function isKnownServerActionDeployment(deploymentId) {
    return Boolean(deploymentId && exports.KNOWN_SERVER_ACTION_DEPLOYMENT_IDS.has(deploymentId));
}
const ACTION_KEYWORDS = {
    toggleStreakProtection: [
        'toggleStreakProtection',
        'streakProtection',
        'toggleStreak',
        'togglestreak',
        'streak protection',
        'streak',
        '连击保护',
        '连击',
        '保护'
    ],
    claimBonusPoints: [
        'claimBonusPoints',
        'claimAllPoints',
        'claimallpoints',
        'claimBonus',
        'bonusPoints',
        'bonus points',
        'claim points',
        'claim',
        'bonus',
        '领取奖励',
        '领取积分',
        '奖励积分',
        '奖励'
    ]
};
const DIRECT_ACTION_NAMES = {
    toggleStreakProtection: ['toggleStreakProtection'],
    claimBonusPoints: ['claimBonusPoints', 'claimAllPoints']
};
const HASH_PATTERN = /[a-f0-9]{40,64}/gi;
function extractDeploymentIdFromHtml(html) {
    const match = html.match(/(?:[?&]dpl=|["']deploymentId["']\s*:\s*["'])([0-9]{8}-[0-9]+)/i);
    return match?.[1] ?? null;
}
function extractScriptUrls(html, baseUrl = 'https://rewards.bing.com/dashboard') {
    const urls = new Set();
    const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = scriptPattern.exec(html))) {
        const src = match[1];
        if (!src || !/\.js(?:\?|$)/i.test(src))
            continue;
        try {
            const url = new URL(src, baseUrl);
            if (url.hostname.endsWith('rewards.bing.com') || url.pathname.includes('/_next/static/')) {
                urls.add(url.toString());
            }
        }
        catch {
            // Ignore malformed script URLs from the page.
        }
    }
    return [...urls];
}
function extractServerActionHashesFromSources(sources) {
    return extractServerActionHashResultFromSources(sources).hashes;
}
function extractServerActionHashResultFromSources(sources) {
    const candidates = [];
    for (const source of sources) {
        for (const action of Object.keys(ACTION_KEYWORDS)) {
            candidates.push(...findActionCandidates(source, action));
        }
    }
    const result = {};
    const diagnostics = {};
    for (const action of Object.keys(ACTION_KEYWORDS)) {
        const directHashes = new Set(sources.flatMap(source => findDirectActionHashes(source.content, action)));
        const uniqueHashes = directHashes.size > 0
            ? directHashes
            : new Set(candidates.filter(candidate => candidate.action === action).map(candidate => candidate.hash));
        if (uniqueHashes.size === 1) {
            result[action] = [...uniqueHashes][0];
            diagnostics[action] = { candidateCount: 1, unique: true, reason: 'unique' };
        }
        else if (uniqueHashes.size > 1) {
            diagnostics[action] = { candidateCount: uniqueHashes.size, unique: false, reason: 'ambiguous' };
        }
        else {
            diagnostics[action] = { candidateCount: 0, unique: false, reason: 'no-candidate' };
        }
    }
    return { hashes: result, diagnostics };
}
function findActionCandidates(source, action) {
    const content = source.content;
    if (!content)
        return [];
    const lower = content.toLowerCase();
    const candidates = [];
    for (const keyword of ACTION_KEYWORDS[action]) {
        const needle = keyword.toLowerCase();
        let keywordIndex = lower.indexOf(needle);
        while (keywordIndex >= 0) {
            const windowStart = Math.max(0, keywordIndex - 4500);
            const windowEnd = Math.min(content.length, keywordIndex + needle.length + 4500);
            const context = content.slice(windowStart, windowEnd);
            const contextLower = context.toLowerCase();
            const localKeywordIndex = keywordIndex - windowStart;
            const hashes = collectHashes(context);
            for (const hash of hashes) {
                const hashIndex = contextLower.indexOf(hash.toLowerCase());
                if (hashIndex < 0)
                    continue;
                let score = 10000 - Math.abs(hashIndex - localKeywordIndex);
                if (hasServerActionMarker(context, hashIndex))
                    score += 2500;
                if (source.name === 'dashboard-html')
                    score += 500;
                if (keyword.length >= 8)
                    score += 250;
                candidates.push({ action, hash, score });
            }
            keywordIndex = lower.indexOf(needle, keywordIndex + needle.length);
        }
    }
    return dedupeCandidates(candidates);
}
function findDirectActionHashes(content, action) {
    const hashes = new Set();
    for (const keyword of DIRECT_ACTION_NAMES[action]) {
        const escapedKeyword = escapeRegExp(keyword);
        const beforePattern = new RegExp(`${escapedKeyword}[\\s\\S]{0,240}?createServerReference\\(\\s*["'](${HASH_PATTERN.source})["']`, 'gi');
        let beforeMatch;
        while ((beforeMatch = beforePattern.exec(content))) {
            if (beforeMatch[1])
                hashes.add(beforeMatch[1].toLowerCase());
        }
        const actionNameInArgsPattern = new RegExp(`createServerReference\\(\\s*["'](${HASH_PATTERN.source})["'][^)]{0,240}${escapedKeyword}[^)]{0,240}\\)`, 'gi');
        let actionNameInArgsMatch;
        while ((actionNameInArgsMatch = actionNameInArgsPattern.exec(content))) {
            if (actionNameInArgsMatch[1])
                hashes.add(actionNameInArgsMatch[1].toLowerCase());
        }
        const exportAliasPattern = new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*createServerReference\\(\\s*["'](${HASH_PATTERN.source})["'][\\s\\S]{0,240}?\\)[\\s\\S]{0,300}?\\b\\1\\s+as\\s+${escapedKeyword}\\b`, 'gi');
        let exportAliasMatch;
        while ((exportAliasMatch = exportAliasPattern.exec(content))) {
            if (exportAliasMatch[2])
                hashes.add(exportAliasMatch[2].toLowerCase());
        }
    }
    return [...hashes];
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function collectHashes(text) {
    const hashes = new Set();
    let match;
    while ((match = HASH_PATTERN.exec(text))) {
        const hash = match[0].toLowerCase();
        if (hash.length >= 40)
            hashes.add(hash);
    }
    return [...hashes];
}
function hasServerActionMarker(context, hashIndex) {
    const before = context.slice(Math.max(0, hashIndex - 120), hashIndex).toLowerCase();
    const after = context.slice(hashIndex, Math.min(context.length, hashIndex + 120)).toLowerCase();
    return (before.includes('createserverreference') ||
        before.includes('$action_id_') ||
        before.includes('next-action') ||
        after.includes('createserverreference') ||
        after.includes('$action_id_') ||
        after.includes('next-action'));
}
function dedupeCandidates(candidates) {
    const bestByHash = new Map();
    for (const candidate of candidates) {
        const existing = bestByHash.get(candidate.hash);
        if (!existing || candidate.score > existing.score) {
            bestByHash.set(candidate.hash, candidate);
        }
    }
    return [...bestByHash.values()];
}
//# sourceMappingURL=ServerActions.js.map