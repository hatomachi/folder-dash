/**
 * Search filter utilities — pure functions for keyword-based path filtering.
 * These functions are independent of Obsidian APIs and can be unit tested.
 */

/**
 * Parse a search query string into normalized lowercase keywords.
 * Splits on half-width and full-width spaces, filters empty tokens.
 */
export function parseSearchKeywords(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[\s　]+/)
        .filter(k => k.length > 0);
}

/**
 * Check whether a given path matches ALL keywords (AND search).
 * Both path and keywords are compared in lowercase.
 */
export function matchesAllKeywords(path: string, keywords: string[]): boolean {
    if (keywords.length === 0) return true;
    const lowerPath = path.toLowerCase();
    return keywords.every(kw => lowerPath.includes(kw));
}
