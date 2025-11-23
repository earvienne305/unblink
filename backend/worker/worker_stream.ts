import { encode } from "cbor-x";
import type { PassThroughOpts, ServerToWorkerStreamMessage, WorkerStreamToServerMessage } from "../../shared";
import { logger } from "../logger";
import { streamMedia, type StartStreamArg } from "../stream/index";
import type { WorkerState } from "./worker_state";
declare var self: Worker;

logger.info("Worker 'stream' started");

const workerState: WorkerState = {
    streams: new Map(),
};


const loops: {
    [loop_id: string]: {
        controller: AbortController;
    }
} = {};


process.on("unhandledRejection", (r) => {
    console.error("[worker] unhandledRejection:", r);
    try { postMessage?.({ __worker_error: String(r) }); } catch (_) { }
});
process.on("uncaughtException", (e) => {
    console.error("[worker] uncaughtException:", e);
    try { postMessage?.({ __worker_error: String(e && e.stack || e) }); } catch (_) { }
});

function sendMessage(msg: WorkerStreamToServerMessage) {
    const worker_msg = encode(msg);
    self.postMessage(worker_msg, [worker_msg.buffer]);
}

async function startStream(stream: StartStreamArg, signal: AbortSignal, passthrough: PassThroughOpts) {
    logger.info(`Starting media stream for ${stream.id}`);

    await streamMedia(stream, (msg) => {
        const worker_msg: WorkerStreamToServerMessage = {
            ...msg,
            ...passthrough,
        }

        // logger.info({ decoded_is_ephemeral: passthrough.is_ephemeral, passthrough }, 'Forwarding message here');
        sendMessage(worker_msg);
    }, signal, () => workerState);
}

async function startFaultTolerantStream(stream: StartStreamArg, signal: AbortSignal, passthrough: PassThroughOpts) {
    const state = {
        hearts: 5,
    }
    let recovery_timeout: NodeJS.Timeout | null = null;
    while (true) {
        try {
            recovery_timeout = setTimeout(() => {
                logger.info(`Stream ${stream.id} has been stable for 30 seconds, full recovery.`);
                state.hearts = 5;
            }, 30000);
            await startStream(stream, signal, passthrough);
            logger.info('Stream ended gracefully, stopping.')
            break;
        } catch (e) {
            if (recovery_timeout) clearTimeout(recovery_timeout);
            state.hearts -= 1;
            if (state.hearts <= 0) {
                logger.error(e, `Stream for ${stream.id} has failed too many times, giving up.`);
                return;
            }
            logger.error(e, `Error in streaming loop for ${stream.id}, restarting (${state.hearts} hearts remaining)...`);
            if (signal.aborted) {
                logger.info(`Abort signal received, stopping stream for ${stream.id}`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

self.addEventListener("message", async (event) => {
    const msg: ServerToWorkerStreamMessage = event.data;


    if (msg.type === 'start_stream') {

        // Make all keys nonnullable
        const passthrough: Required<PassThroughOpts> = {
            id: msg.id,
            is_ephemeral: msg.is_ephemeral as any,
        }

        const loop_id = msg.id;
        // console.log({ msg: JSON.stringify(msg) }, `Starting stream`);

        if (msg.uri) {
            const abortController = new AbortController();

            // Initialize state for this stream in global workerState
            workerState.streams.set(loop_id, {
                should_write_moment: msg.should_record_moments ?? true, // Default to true for backward compatibility
            });

            loops[loop_id] = {
                controller: abortController,
            };

            startFaultTolerantStream({
                id: loop_id,
                uri: msg.uri,
                save_location: msg.saveDir,
                is_ephemeral: msg.is_ephemeral,
            }, abortController.signal, passthrough);
        }
    }



    if (msg.type === 'stop_stream') {
        // Stop the stream and clean up resources
        const loop_id = msg.id;
        logger.info(`Stopping stream ${loop_id}`);
        loops[loop_id]?.controller.abort();

        // Clean up state for this stream
        workerState.streams.delete(loop_id);
    }

    if (msg.type === 'set_moment_state') {
        logger.info({
            media_id: msg.media_id,
            should_write_moment: msg.should_write_moment,
            moment_id: msg.current_moment_id,
            discard_previous_maybe_moment: msg.discard_previous_maybe_moment,
        }, 'Setting moment state');

        const streamState = workerState.streams.get(msg.media_id);
        if (streamState) {
            streamState.should_write_moment = msg.should_write_moment;
            streamState.current_moment_id = msg.current_moment_id;
            streamState.discard_previous_maybe_moment = msg.discard_previous_maybe_moment;
        } else {
            // Initialize if doesn't exist
            workerState.streams.set(msg.media_id, {
                should_write_moment: msg.should_write_moment,
                current_moment_id: msg.current_moment_id,
                discard_previous_maybe_moment: msg.discard_previous_maybe_moment,
            });
        }
    }
});
