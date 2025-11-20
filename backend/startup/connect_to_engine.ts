import type { ServerWebSocket } from "bun";

import type { ServerEphemeralState, ServerToClientMessage } from "~/shared";
import type { WebhookMessage } from "~/shared/alert";
import { Conn } from "~/shared/Conn";
import type { EngineToServer, ServerRegistrationMessage, ServerToEngine } from "~/shared/engine";
import { createMoment, getMediaUnitById, updateMediaUnit } from "../database/utils";
import { logger } from "../logger";
import type { WsClient } from "../WsClient";


export function connect_to_engine(props: {
    state: () => ServerEphemeralState,
    ENGINE_URL: string,
    forward_to_webhook: (msg: WebhookMessage) => Promise<void>,
    clients: () => Map<ServerWebSocket, WsClient>,
}) {
    const engine_conn = new Conn<ServerRegistrationMessage | ServerToEngine, EngineToServer>(`wss://${props.ENGINE_URL}/ws`, {
        onOpen() {
            const msg: ServerRegistrationMessage = {
                type: "i_am_server",
            }
            engine_conn.send(msg);
        },
        onClose() {
            logger.info("Disconnected from Zapdos Labs engine WebSocket");
        },
        onError(event) {
            logger.error(event, "WebSocket to engine error:");
        },
        async onMessage(decoded) {
            if (decoded.type === 'media_summary') {
                // Handle media summary
                logger.info({ decoded }, `Received media summary`);

                for (const moment of decoded.summary.moments) {
                    await createMoment({
                        id: crypto.randomUUID(),
                        media_id: decoded.media_id,
                        from_time: moment.from_time,
                        to_time: moment.to_time,
                        what_old: moment.what_old,
                        what_new: moment.what_new,
                        importance_score: moment.importance_score,
                        labels: moment.labels,
                    })
                }

                logger.info(`Stored ${decoded.summary.moments.length} moments for media_id ${decoded.media_id}`);
                return;
            }

            if (decoded.type === 'frame_description') {
                // Store in database
                // logger.info({ decoded }, `Received description`);
                updateMediaUnit(decoded.frame_id, {
                    description: decoded.description,
                })

                const mu = await getMediaUnitById(decoded.frame_id);
                if (!mu) {
                    logger.error(`MediaUnit not found for frame_id ${decoded.frame_id}`);
                    return;
                }

                const msg: ServerToClientMessage = {
                    type: 'agent_card',
                    media_unit: {
                        ...mu,
                        description: decoded.description,
                    }
                }

                // Forward to clients 
                for (const [id, client] of props.clients()) {
                    client.send(msg, false);
                }

                // Also forward to webhook
                props.forward_to_webhook({
                    event: 'description',
                    data: {
                        created_at: new Date().toISOString(),
                        stream_id: decoded.stream_id,
                        frame_id: decoded.frame_id,
                        description: decoded.description,
                    }
                });
            }

            if (decoded.type === 'frame_embedding') {
                // Convert number[] to Uint8Array for database storage
                const embeddingBuffer = decoded.embedding ? new Uint8Array(new Float32Array(decoded.embedding).buffer) : null;

                // Store in database
                updateMediaUnit(decoded.frame_id, {
                    embedding: embeddingBuffer,
                })
            }

            if (decoded.type === 'frame_object_detection') {
                // // Also forward to webhook
                const msg: WebhookMessage = {
                    type: 'object_detection',
                    data: {
                        created_at: new Date().toISOString(),
                        stream_id: decoded.stream_id,
                        frame_id: decoded.frame_id,
                        objects: decoded.objects,
                    }
                }
                props.forward_to_webhook(msg);

                // Forward to clients
                for (const [, client] of props.clients()) {
                    client.send(decoded);
                }
            }

            if (decoded.type === 'frame_motion_energy') {
                // Forward to clients
                for (const [, client] of props.clients()) {
                    client.send(decoded);
                }

                const state = props.state();
                state.motion_energy_messages.push(decoded);
                // logger.info({ decoded }, "Received motion energy data");
            }
        }
    });

    return engine_conn;
}