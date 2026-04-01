import { invoke } from '@tauri-apps/api/core';
import { LogNode } from '@/lib/robotParser';

export interface ParseResult {
    dbPath: string;
    rootSuite: LogNode;
}

type CacheEntry = {
    result: ParseResult;
    timestamp: number;
};

type ParseListener = (xmlPath: string, result: ParseResult | null, error: string | null) => void;

// Module-level singleton cache (survives component unmounts)
const cache = new Map<string, CacheEntry>();
const inFlightPaths = new Map<string, Promise<ParseResult>>();
const listeners = new Set<ParseListener>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Subscribe to parse completion events.
 * Returns cleanup function.
 */
export function onParseComplete(listener: ParseListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notifyListeners(xmlPath: string, result: ParseResult | null, error: string | null) {
    listeners.forEach(fn => {
        try { fn(xmlPath, result, error); } catch { /* noop */ }
    });
}

/**
 * Get cached result, or return null if not cached / expired.
 */
export function getCachedResult(xmlPath: string): ParseResult | null {
    const entry = cache.get(xmlPath);
    if (!entry) {
        return null;
    }

    if (Date.now() - entry.timestamp >= CACHE_TTL_MS) {
        // Remove expired entry to prevent unbounded cache growth.
        cache.delete(xmlPath);
        return null;
    }

    return entry.result;
}

/**
 * Parse XML in background. Result is cached globally.
 * If same path is already being parsed, deduplicates the request.
 * Returns the parsed ParseResult.
 */
export async function parseXmlBackground(xmlPath: string): Promise<ParseResult> {
    // Check cache
    const cached = getCachedResult(xmlPath);
    if (cached) return cached;

    // Deduplicate concurrent requests for same path
    const existing = inFlightPaths.get(xmlPath);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const result = await invoke<ParseResult>('parse_robot_xml', { xmlPath });
            cache.set(xmlPath, { result, timestamp: Date.now() });
            notifyListeners(xmlPath, result, null);
            return result;
        } catch (e: any) {
            const errMsg = typeof e === 'string' ? e : e?.message || 'Parse failed';
            notifyListeners(xmlPath, null, errMsg);
            throw e;
        } finally {
            inFlightPaths.delete(xmlPath);
        }
    })();

    inFlightPaths.set(xmlPath, promise);
    return promise;
}

/**
 * Invalidate a specific cache entry (e.g. after re-run).
 */
export function invalidateCache(xmlPath: string) {
    cache.delete(xmlPath);
}

/**
 * Clear entire cache.
 */
export function clearCache() {
    cache.clear();
}
