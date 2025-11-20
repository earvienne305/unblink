/**
 * Utility for calculating and caching frame statistics
 */

export type FrameStats = {
    motion_energy: number;
    total_avg: number;
    sma10: number;
};

export type StreamStats = {
    sum: number;
    count: number;
    last10: number[];
};

/**
 * Calculate frame statistics including motion energy, total average, and 10-period simple moving average
 * @param streamStatsMap - Map of stream IDs to their running statistics
 * @param stream_id - The stream identifier
 * @param motion_energy - The current frame's motion energy value
 * @returns FrameStats object with motion_energy, total_avg, and sma10
 */
export function calculateFrameStats(
    streamStatsMap: Map<string, StreamStats>,
    stream_id: string,
    motion_energy: number
): FrameStats {
    let streamStats = streamStatsMap.get(stream_id);
    if (!streamStats) {
        streamStats = { sum: 0, count: 0, last10: [] };
        streamStatsMap.set(stream_id, streamStats);
    }

    // Update running stats
    streamStats.sum += motion_energy;
    streamStats.count += 1;
    streamStats.last10.push(motion_energy);
    if (streamStats.last10.length > 10) {
        streamStats.last10.shift();
    }

    // Calculate averages
    const total_avg = streamStats.sum / streamStats.count;
    const sma10 = streamStats.last10.reduce((a, b) => a + b, 0) / streamStats.last10.length;

    return {
        motion_energy,
        total_avg,
        sma10,
    };
}

/**
 * Clear stats for a specific stream (useful when stream restarts)
 */
export function clearStreamStats(streamStatsMap: Map<string, StreamStats>, stream_id: string): void {
    streamStatsMap.delete(stream_id);
}
