import { describe, it, expect } from 'vitest';
import { parseSearchKeywords, matchesAllKeywords } from './searchFilter';

describe('parseSearchKeywords', () => {
    it('splits half-width spaces into keywords', () => {
        expect(parseSearchKeywords('foo bar')).toEqual(['foo', 'bar']);
    });

    it('splits full-width spaces into keywords', () => {
        expect(parseSearchKeywords('foo　bar')).toEqual(['foo', 'bar']);
    });

    it('normalizes to lowercase', () => {
        expect(parseSearchKeywords('Foo BAR')).toEqual(['foo', 'bar']);
    });

    it('filters empty tokens from multiple spaces', () => {
        expect(parseSearchKeywords('  foo   bar  ')).toEqual(['foo', 'bar']);
    });

    it('returns empty array for empty/whitespace-only input', () => {
        expect(parseSearchKeywords('')).toEqual([]);
        expect(parseSearchKeywords('   ')).toEqual([]);
    });

    it('handles mixed half-width and full-width spaces', () => {
        expect(parseSearchKeywords('alpha　beta gamma')).toEqual(['alpha', 'beta', 'gamma']);
    });
});

describe('matchesAllKeywords', () => {
    it('returns true when no keywords (empty filter)', () => {
        expect(matchesAllKeywords('any/path/here', [])).toBe(true);
    });

    it('matches a single keyword in the path', () => {
        expect(matchesAllKeywords('shared/維持管理/system-a/epic-1/_Task.md', ['system-a'])).toBe(true);
    });

    it('matches multiple keywords (AND logic)', () => {
        expect(matchesAllKeywords('shared/維持管理/system-a/epic-1/_Task.md', ['system-a', 'epic-1'])).toBe(true);
    });

    it('returns false when one keyword does not match', () => {
        expect(matchesAllKeywords('shared/維持管理/system-a/epic-1/_Task.md', ['system-a', 'epic-99'])).toBe(false);
    });

    it('is case-insensitive on the path side (keywords assumed pre-lowercased)', () => {
        expect(matchesAllKeywords('Shared/System-A/Epic-1', ['shared', 'system-a'])).toBe(true);
    });

    it('matches Japanese characters', () => {
        expect(matchesAllKeywords('shared/維持管理/サーバー/_Task.md', ['維持管理', 'サーバー'])).toBe(true);
    });
});
