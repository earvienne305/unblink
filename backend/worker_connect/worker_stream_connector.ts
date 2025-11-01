import type { ServerToWorkerStreamMessage } from "~/shared";
import { table_media } from "../database";
import { logger } from "../logger";
import { spawn_worker } from "./shared";

export async function start_streams(opts: {
    worker_stream: Worker
}) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // stagger starts
    try {
        const allMedia = await table_media.query().toArray();
        for (const media of allMedia) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // stagger starts
            if (media.id && media.uri) {
                logger.info(`Starting stream for media: ${media.name} (${media.id})`);
                start_stream({
                    worker: opts.worker_stream,
                    stream_id: media.id as string,
                    uri: media.uri as string,
                });
            }
        }
    } catch (error) {
        logger.error(error, "Error starting streams from database");
    }
}

export function start_stream(opts: {
    worker: Worker,
    stream_id: string,
    uri: string,
}) {

    const start_msg: ServerToWorkerStreamMessage = {
        type: 'start_stream',
        stream_id: opts.stream_id,
        uri: opts.uri
    }

    opts.worker.postMessage(start_msg);

}

export function stop_stream(opts: {
    worker: Worker,
    stream_id: string,
}) {
    const stop_msg: ServerToWorkerStreamMessage = {
        type: 'stop_stream',
        stream_id: opts.stream_id,
    }

    opts.worker.postMessage(stop_msg);
}
