import fs from "fs/promises";
import type { MediaInput } from "node-av";
import { logger as _logger } from "~/backend/logger";

const logger = _logger.child({ worker: 'stream-detector' });

export type StreamType = 'file' | 'live';

/**
 * Detects whether a media source is a live stream or a file-based source.
 * 
 * Detection strategy:
 * 1. Local file paths are always classified as 'file'
 * 2. Remote sources are classified based on duration:
 *    - If duration exists and > 0: 'file' (includes remote MP4s, recorded videos)
 *    - If no duration or duration <= 0: 'live' (includes RTSP, HLS live streams)
 * 
 * @param uri - The URI or file path of the media source
 * @param input - The opened MediaInput instance
 * @returns 'file' for recorded/complete videos, 'live' for live streams
 */
export async function detectStreamType(uri: string, input: MediaInput): Promise<StreamType> {
    // Check if it's a local file first (fastest check)
    try {
        await fs.access(uri);
        logger.debug({ uri }, "Detected local file");
        return 'file';
    } catch {
        // Not a local file, continue with remote source detection
    }

    // Check duration from format context
    const formatContext = input.getFormatContext();
    const duration = formatContext?.duration;

    logger.debug({ 
        uri, 
        duration,
        hasDuration: !!duration && duration > 0
    }, "Checking remote source duration");

    // If it has a valid duration, treat as file (includes remote MP4s, recordings)
    // If no duration, it's likely a live stream (RTSP, live HLS, etc.)
    const streamType: StreamType = (duration && duration > 0) ? 'file' : 'live';

    logger.info({ 
        uri, 
        duration,
        streamType,
        durationSeconds: duration ? Number(duration) / 1000000 : null // AV_TIME_BASE is microseconds
    }, "Stream type detected");

    return streamType;
}
