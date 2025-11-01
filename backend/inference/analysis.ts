
const workerUrl = new URL("../worker/example_worker.ts", import.meta.url).href;
const worker = new Worker(workerUrl);

worker.postMessage("hello");
worker.addEventListener("message", event => {
    console.log(event.data);
});

// Prevents the worker from keeping the Node.js event loop active
(worker as any).unref();