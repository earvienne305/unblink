import type { Packet, Stream } from "node-av";
import { logger as _logger } from "~/backend/logger";
import type { StreamType } from "./stream_detector";

const logger = _logger.child({ worker: 'frame-timing' });

export type TimingState = {
    firstPacketPts: bigint | null;
    playbackStartTime: number;
    lastFrameSendTime: number;
    lastLiveStreamSendTime: number;
    targetFrameIntervalMs: number;
};

/**
 * Creates initial timing state for frame synchronization
 */
export function createTimingState(videoStream: Stream): TimingState {
    // Calculate target frame interval with validation
    let targetFrameIntervalMs = (videoStream.avgFrameRate.den * 1000) / videoStream.avgFrameRate.num;
    
    if (!isFinite(targetFrameIntervalMs) || targetFrameIntervalMs <= 0) {
        logger.warn({
            avgFrameRate: videoStream.avgFrameRate,
            calculated: targetFrameIntervalMs
        }, "Invalid frame rate detected, defaulting to 30 FPS");
        targetFrameIntervalMs = 1000 / 30; // Default to 30 FPS
    }

    return {
        firstPacketPts: null,
        playbackStartTime: 0,
        lastFrameSendTime: 0,
        lastLiveStreamSendTime: 0,
        targetFrameIntervalMs,
    };
}

/**
 * Calculate timing information based on PTS (Presentation Time Stamp)
 * Converts PTS to real-world milliseconds using the stream's timebase
 */
export function calculatePTSTiming(
    packet: Packet,
    timingState: TimingState,
    videoStream: Stream
) {
    if (timingState.firstPacketPts === null) return null;

    const ptsDiff = packet.pts - timingState.firstPacketPts;
    const elapsedFileTimeMs = Number(ptsDiff) * videoStream.timeBase.num * 1000 / videoStream.timeBase.den;
    const targetTime = timingState.playbackStartTime + elapsedFileTimeMs;

    return { elapsedFileTimeMs, targetTime };
}

/**
 * Apply frame timing strategy based on stream type
 * @param beforeProcessing - true for pre-processing delays, false for post-processing delays
 * @returns 'skip' if frame should be skipped (live stream throttling), undefined otherwise
 */
export async function applyFrameTiming(
    packet: Packet,
    beforeProcessing: boolean,
    timeSyncType: StreamType,
    timingState: TimingState,
    videoStream: Stream
): Promise<'skip' | undefined> {
    // Initialize timing on first frame for file-based streams
    if (timingState.firstPacketPts === null && timeSyncType === 'file') {
        timingState.firstPacketPts = packet.pts;
        timingState.playbackStartTime = Date.now();
        logger.debug({ pts: packet.pts, timeSyncType }, "Starting timed playback");
        return;
    }

    if (timeSyncType === 'live') {
        // Live streams: Simple 30 FPS throttling (no PTS timing needed)
        const now = Date.now();
        if (now - timingState.lastLiveStreamSendTime < 1000 / 30) {
            return 'skip';
        }
        timingState.lastLiveStreamSendTime = now;
    } else if (timeSyncType === 'file') {
        // File streams: Dual-delay system for smooth continuous streaming
        // Works for both ephemeral (moment playback) and continuous camera feeds
        if (beforeProcessing && timingState.lastFrameSendTime > 0) {
            // Pre-processing: Prevent frame bursts by enforcing minimum interval
            const timeSinceLastFrame = Date.now() - timingState.lastFrameSendTime;
            if (timeSinceLastFrame < timingState.targetFrameIntervalMs) {
                const preDelay = timingState.targetFrameIntervalMs - timeSinceLastFrame;
                // Cap delay to reasonable maximum (5 seconds) to prevent overflow
                const cappedDelay = Math.min(preDelay, 5000);
                if (cappedDelay > 0 && isFinite(cappedDelay)) {
                    await new Promise(resolve => setTimeout(resolve, cappedDelay));
                }
            }
        } else if (!beforeProcessing) {
            // Post-processing: Fine-tune timing with PTS for accuracy
            const timing = calculatePTSTiming(packet, timingState, videoStream);
            if (timing) {
                const delay = timing.targetTime - Date.now();
                if (delay > 0) {
                    // Cap delay to reasonable maximum (5 seconds) to prevent overflow
                    const cappedDelay = Math.min(delay, 5000);
                    if (isFinite(cappedDelay)) {
                        await new Promise(resolve => setTimeout(resolve, cappedDelay));
                    }
                } else if (delay < -100) {
                    logger.debug({ delay, pts: packet.pts }, "File playback running behind schedule");
                }
            }
            timingState.lastFrameSendTime = Date.now();
        }
    }
}
