import { decode, encode } from "cbor-x";
import type { ClientToServerMessage, WorkerStreamToServerMessage, ServerToClientMessage } from "~/shared";
import { createSignal, untrack } from "solid-js";
import { subscription } from "../shared";

export const [newMessage, setNewMessage] = createSignal<ServerToClientMessage>();

// So that we can queue messages if the client is not ready
export class Conn {
    queue: Buffer[] = [];
    constructor(public ws: WebSocket) {
        this.ws.addEventListener("open", () => {
            this.flush();
        });
    }

    send(message: ClientToServerMessage) {
        const encoded = encode(message);
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(encoded);
        } else {
            this.queue.push(encoded);
        }
    }

    flush() {
        while (this.queue.length > 0) {
            const message = this.queue.shift();
            if (message) {
                this.ws.send(message);
            }
        }
    }
}


export const connectWebSocket = () => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => console.log("WebSocket connected");
    ws.onerror = (e) => console.error("WebSocket error:", e);
    ws.onclose = () => console.log("WebSocket closed");
    ws.onmessage = (event) => {

        const data = new Uint8Array(event.data);
        const decoded = decode(data) as ServerToClientMessage;
        const sub = untrack(subscription)
        const session_id = sub?.session_id
        if (decoded.session_id !== session_id) {
            console.warn(`Received message for session_id ${decoded.session_id}, but current session_id is ${session_id}. Ignoring message.`, decoded);
            return;
        }
        // console.log("WebSocket message received", decoded);
        setNewMessage(decoded);
    };

    const conn = new Conn(ws);
    return conn;
};

