import type { Frame, Packet } from "node-av";
import {
    AV_CODEC_ID_AAC,
    AV_CODEC_ID_MJPEG,
    AV_PIX_FMT_YUVJ420P,
    AV_SAMPLE_FMT_FLTP,
    Decoder,
    Encoder,
    FF_ENCODER_AAC,
    FF_ENCODER_MJPEG,
    FilterAPI,
    FilterPreset,
    MediaInput,
} from "node-av";
import { MOMENTS_DIR } from "~/backend/appdir";
import { logger as _logger } from "~/backend/logger";
import type { WorkerState } from "~/backend/worker/worker_state";
import type { ServerToWorkerStreamMessage_Add_Stream, StreamMessage } from "~/shared";
import { getCodecs, shouldSkipTranscode } from "./codec_utils";
import { applyFrameTiming, calculatePTSTiming, createTimingState } from "./frame_timing";
import { OutputFile, type OutputFileObject } from "./output_file";
import { raceWithTimeout } from "./packet_utils";
import { detectStreamType } from "./stream_detector";

const logger = _logger.child({ worker: 'stream' });
const MAX_SIZE = 720;

export async function streamMedia(
    startArg: ServerToWorkerStreamMessage_Add_Stream,
    onMessage: (msg: StreamMessage) => void,
    signal: AbortSignal,
    state$: () => WorkerState
) {
    logger.info({ uri: startArg.uri }, 'Starting streamMedia for');

    logger.info(`Opening media input: ${startArg.uri}`);
    await using input = await MediaInput.open(startArg.uri, {
        options: startArg.uri.toLowerCase().startsWith("rtsp://")
            ? { rtsp_transport: "tcp" }
            : undefined,
    });

    const videoStream = input.video();
    if (!videoStream) {
        throw new Error("No video stream found");
    }

    logger.info(`Done opening media input`);

    let audioPipeline: {
        decoder: Decoder;
        encoder: Encoder;
        filter: FilterAPI;
    } | undefined = undefined;

    const audioStream = input.audio();
    if (audioStream && audioStream.codecpar.codecId !== AV_CODEC_ID_AAC) {
        const decoder = await Decoder.create(audioStream);

        const targetSampleRate = 48000;
        const filterChain = FilterPreset.chain()
            .aformat(AV_SAMPLE_FMT_FLTP, targetSampleRate, "stereo")
            .asetnsamples(1024)
            .build();

        const filter = FilterAPI.create(filterChain, {
            timeBase: audioStream.timeBase,
        });

        const encoder = await Encoder.create(FF_ENCODER_AAC, {
            timeBase: { num: 1, den: targetSampleRate },
        });

        audioPipeline = { encoder, decoder, filter };
    }

    const videoDecoder = await Decoder.create(videoStream);

    const longer_side = Math.max(
        videoStream.codecpar.width,
        videoStream.codecpar.height,
    );

    let newWidth = videoStream.codecpar.width;
    let newHeight = videoStream.codecpar.height;
    if (longer_side > MAX_SIZE) {
        const scale = MAX_SIZE / longer_side;
        newWidth = Math.round(newWidth * scale);
        newHeight = Math.round(newHeight * scale);
    }

    logger.info({ newWidth, newHeight }, "Scaling video to:");

    const filterChain = FilterPreset.chain()
        .format(AV_PIX_FMT_YUVJ420P)
        .scale(newWidth, newHeight, {
            flags: "lanczos",
        })
        .build();
    const videoFilter = FilterAPI.create(filterChain, {
        timeBase: videoStream.timeBase,
    });

    logger.info({
        format: videoStream.codecpar.format,
        codecId: videoStream.codecpar.codecId,
    }, "Input video:");

    const skipTranscode = shouldSkipTranscode(videoStream);

    logger.info({
        skipTranscode,
        format: videoStream.codecpar.format,
        codecId: videoStream.codecpar.codecId,
        AV_CODEC_ID_MJPEG,
    }, "Transcode decision:");

    const codecItem = getCodecs(newWidth, newHeight, videoStream, audioStream);


    logger.info(codecItem, "Initialized stream codecs");
    onMessage(codecItem);

    using videoEncoder = await Encoder.create(FF_ENCODER_MJPEG, {
        timeBase: videoStream.timeBase,
        frameRate: videoStream.avgFrameRate,
        bitrate: '2M',
        options: {
            strict: 'experimental',
            flags: 'global_header',
        },
    });

    async function sendFrameMessage(packet: Packet, timestamp?: number) {
        if (!packet.data) return;
        const frame_msg: StreamMessage = {
            type: "frame",
            data: packet.data,
            timestamp
        };
        onMessage(frame_msg);
    }

    async function writeToOutputFile(packet: Packet, output: OutputFileObject) {
        using cloned = packet.clone();
        if (cloned) {
            const now = Date.now();

            // Initialize start time on first frame
            if (output.startTime === null) {
                output.startTime = now;
            }

            // Calculate timestamp based on elapsed wall-clock time
            const elapsedMs = now - output.startTime;

            cloned.pts = BigInt(elapsedMs);
            cloned.dts = BigInt(elapsedMs);
            cloned.streamIndex = output.videoFileOutputIndex;

            await output.mediaOutput.getFormatContext().interleavedWriteFrame(cloned);
        }
    }

    async function processPacket(packet: Packet, decodedFrame: Frame, timestamp?: number) {
        let filteredFrame: Frame | null = null;

        try {
            // Filter once
            if (videoFilter) {
                filteredFrame = await videoFilter.process(decodedFrame);
                if (!filteredFrame) return;
            }

            const frameToUse = filteredFrame || decodedFrame;

            // Send frame for streaming
            if (skipTranscode) {
                await sendFrameMessage(packet, timestamp);
                // For skipTranscode, we still need to encode for object detection
                using encodedPacket = await videoEncoder.encode(frameToUse);

                if (encodedPacket?.data) {
                    // await saveFrameForObjectDetection(encodedPacket.data);
                    if (momentOutput) await writeToOutputFile(encodedPacket, momentOutput);
                }
            } else {
                // Encode once and reuse for both streaming and object detection
                using encodedPacket = await videoEncoder.encode(frameToUse);
                if (encodedPacket?.data) {
                    await sendFrameMessage(encodedPacket, timestamp);
                    // await saveFrameForObjectDetection(encodedPacket.data);
                    // Write same packet to moment output if it exists
                    if (momentOutput) await writeToOutputFile(encodedPacket, momentOutput);
                }
            }
        } finally {
            // Always free the filtered frame
            filteredFrame?.free();
        }
    }

    if (startArg.init_seek_sec) {
        input.seekSync(startArg.init_seek_sec);
    }

    // Detect stream type (live vs file-based)
    const timeSyncType = startArg.is_ephemeral ? 'file' : await detectStreamType(startArg.uri, input);

    logger.info({ 
        uri: startArg.uri, 
        timeSyncType,
        isEphemeral: startArg.is_ephemeral,
        avgFrameRate: videoStream.avgFrameRate 
    }, "Stream timing configuration");

    const packets = input.packets();
    
    // Initialize frame timing state
    const timingState = createTimingState(videoStream);

    logger.info("Entering main streaming loop");

    let momentOutput: OutputFileObject | null = null;

    while (true) {
        const res = await raceWithTimeout(packets.next(), signal, 10000);

        if (!res || res.done) {
            logger.info("Stream ended or timed out");
            break;
        }

        const packet = res.value;

        if (!startArg.is_ephemeral) {
            // Handle moment-specific output
            const streamState = state$().streams.get(startArg.id);
            if (streamState?.should_write_moment) {
                // Check if we need to create a new moment output (new moment started)

                if (momentOutput === null || momentOutput.output_id !== streamState.current_moment_id) {
                    // Close previous moment output if exists
                    if (momentOutput) {
                        logger.info({ output_id: momentOutput.output_id }, "Closing previous moment output");
                        await OutputFile.close(momentOutput);
                    }

                    if (streamState.current_moment_id) {
                        const codecContext = videoEncoder.getCodecContext()
                        if (codecContext) {
                            momentOutput = await OutputFile.create(startArg.id, streamState.current_moment_id, codecContext, startArg.save_location || MOMENTS_DIR);
                            // logger.info({ path: momentOutput.path, output_id: streamState.current_moment_id }, "Created new moment output file");
                        }
                    }
                }
            } else if (momentOutput !== null) {
                // should_write_moment is false - close the moment output
                const shouldDelete = streamState?.discard_previous_maybe_moment === true;

                if (shouldDelete) {
                    // logger.info({ output_id: momentOutput.output_id }, "Moment was false alarm, closing and deleting output");
                    await OutputFile.discard(momentOutput);
                } else {
                    // Real moment - close, rename, and notify with final path
                    const finalPath = await OutputFile.close(momentOutput);
                    logger.info({ output_id: momentOutput.output_id, final_path: finalPath }, "Moment ended, closing and notifying with final path");

                    onMessage({
                        type: 'moment_clip_saved' as const,
                        moment_id: momentOutput.output_id,
                        clip_path: finalPath,
                    });
                }

                momentOutput = null;
            }
        }

        if (packet.streamIndex === videoStream.index) {
            const decodedFrame = await videoDecoder.decode(packet);

            if (!decodedFrame) {
                packet.free();
                continue;
            }

            // Apply pre-processing timing
            const shouldSkip = await applyFrameTiming(packet, true, timeSyncType, timingState, videoStream);
            if (shouldSkip === 'skip') {
                packet.free();
                decodedFrame.free();
                continue;
            }

            try {
                // Calculate timestamp for ephemeral streams (for UI progress)
                let timestamp: number | undefined;
                if (startArg.is_ephemeral) {
                    const timing = calculatePTSTiming(packet, timingState, videoStream);
                    if (timing) {
                        timestamp = (startArg.init_seek_sec || 0) * 1000 + timing.elapsedFileTimeMs;
                    }
                }

                await processPacket(packet, decodedFrame, timestamp);
                
                // Apply post-processing timing
                await applyFrameTiming(packet, false, timeSyncType, timingState, videoStream);
            } catch (error) {
                logger.error({ error: (error as Error).message }, "Error processing packet");
            } finally {
                packet.free();
                decodedFrame.free();
            }
        } else {
            packet.free();
        }
    }

    // Clean up moment output if still open
    if (momentOutput) {
        logger.info("Closing moment output at stream end");
        await OutputFile.close(momentOutput);
    }

    logger.info("Streaming loop ended");

    // Send ended message to frontend
    onMessage({
        type: 'ended'
    });
}