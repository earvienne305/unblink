import type { Packet } from "node-av";
import { logger as _logger } from "~/backend/logger";

const logger = _logger.child({ worker: 'packet-utils' });

/**
 * Race a promise with a timeout and abort signal
 */
export async function raceWithTimeout<T>(
    promise: Promise<IteratorResult<T, any>>,
    abortSignal: AbortSignal,
    ms: number
): Promise<IteratorResult<T, any> | undefined> {
    let timeoutId: NodeJS.Timeout | undefined = undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            logger.warn('Timeout receiving packets');
            reject(new Error('Timeout receiving packets'));
        }, ms);
    });

    const abort_promise = new Promise<never>((_, reject) => {
        if (abortSignal.aborted) {
            return reject(new DOMException('Aborted', 'AbortError'));
        }
        abortSignal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });

    try {
        const result = await Promise.race([promise, timeoutPromise, abort_promise]);
        return result as IteratorResult<T, any>;
    } finally {
        clearTimeout(timeoutId);
    }
}
