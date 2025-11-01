import { encode } from "cbor-x";
import { streamMedia } from "../stream/index";
import { logger } from "../logger";

import type { WorkerStreamToServerMessage, ServerToWorkerStreamMessage } from "../../shared";

declare var self: Worker;

logger.info("Worker 'stream' started");
const streams: {
    [stream_id: string]: {
        controller: AbortController;
    }
} = {};

function sendMessage(msg: WorkerStreamToServerMessage) {
    const worker_msg = encode(msg);
    self.postMessage(worker_msg, [worker_msg.buffer]);
}

async function startStream(stream: {
    id: string;
    uri: string;
}, signal: AbortSignal) {
    logger.info(`Starting media stream for ${stream.id}`);

    await streamMedia(stream.uri, (msg) => {
        const worker_msg = {
            ...msg,
            stream_id: stream.id,
        }
        sendMessage(worker_msg);
    }, signal);
}

async function startFaultTolerantStream(stream: {
    id: string;
    uri: string;
}, signal: AbortSignal) {
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
            await startStream(stream, signal);
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
        logger.info(`Starting stream ${msg.stream_id} with URI ${msg.uri}`);

        const abortController = new AbortController();
        streams[msg.stream_id] = {
            controller: abortController,
        };

        startFaultTolerantStream({
            id: msg.stream_id,
            uri: msg.uri,
        }, abortController.signal);

    }

    if (msg.type === 'stop_stream') {
        logger.info(`Stopping stream ${msg.stream_id}`);
        // Stop the stream and clean up resources
        streams[msg.stream_id]?.controller.abort();
    }
});
