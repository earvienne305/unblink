import path from 'path';
import { WORKER_DIR } from "~/definition";

export function spawn_worker(filename: string, onWorkerMessage: (event: MessageEvent) => void) {
    const workerPath = path.join(WORKER_DIR, filename);
    console.log("Starting worker from URL:", workerPath);
    const worker = new Worker(workerPath);


    worker.addEventListener("message", onWorkerMessage);

    // Prevents the worker from keeping the Node.js event loop active
    (worker as any).unref();

    return worker;
}
