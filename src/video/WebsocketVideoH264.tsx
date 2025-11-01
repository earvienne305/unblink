type PlayerState = {
    mediaSource?: MediaSource;
    chunkQueue: Uint8Array<ArrayBuffer>[];
    queuedBytes: number;
    hasPlayed: boolean;
    live_edge_threshold: number;
    seek_hysteresis: number;
}

const INIT_LIVE_EDGE_THRESHOLD = 1; // seconds
const INIT_SEEK_HYSTERESIS = 0.2; // seconds
const MAX_QUEUED_BYTES = 3 * 1024 * 1024; // 3 MB

function seekToLiveEdge(sourceBuffer: SourceBuffer, s: PlayerState, videoRef: HTMLVideoElement) {
    if (!sourceBuffer || sourceBuffer.updating || !sourceBuffer.buffered.length) return;
    const bufferedEnd = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
    const currentTime = videoRef.currentTime;
    const bufferedAmount = bufferedEnd - currentTime;
    if (bufferedAmount > s.live_edge_threshold + s.seek_hysteresis) {
        const liveEdge = bufferedEnd - s.live_edge_threshold;
        console.log(
            `Seeking to live edge: ${liveEdge.toFixed(2)} (was ${currentTime.toFixed(
                2
            )}, buffered: ${bufferedAmount.toFixed(2)}s)`
        );
        videoRef.currentTime = liveEdge;
    }
}

function trimBuffer(sourceBuffer: SourceBuffer, videoRef: HTMLVideoElement) {
    if (!sourceBuffer || sourceBuffer.updating || !sourceBuffer.buffered.length) return;
    const bufferedStart = sourceBuffer.buffered.start(0);
    const currentTime = videoRef.currentTime;
    const keepBehind = 10;
    const removeEnd = currentTime - keepBehind;

    if (removeEnd > bufferedStart + 1) {
        try {
            console.log(
                `Removing old buffer from ${bufferedStart.toFixed(2)} to ${removeEnd.toFixed(
                    2
                )}, current time: ${currentTime.toFixed(2)}`
            );
            sourceBuffer.remove(bufferedStart, removeEnd);
            return;
        } catch (e) {
            console.error("Buffer remove error:", e);
        }
    }
}

function addChunk(sourceBuffer: SourceBuffer | undefined, s: PlayerState, chunk: Uint8Array<ArrayBuffer>) {
    if (sourceBuffer) {
        // Try to append immediately if idle
        if (!sourceBuffer.updating && s.queuedBytes === 0) {
            try {
                sourceBuffer.appendBuffer(chunk);
                return;
            } catch (error) {
                console.error("Error appending:", error);
            }
        }
    }

    // Otherwise, enqueue
    s.chunkQueue.push(chunk);
    s.queuedBytes += chunk.byteLength;

    // Drop oldest data if queue too large
    while (s.queuedBytes > MAX_QUEUED_BYTES && s.chunkQueue.length > 0) {
        const dropped = s.chunkQueue.shift();
        if (dropped) {
            s.queuedBytes -= dropped.byteLength;
            console.warn(
                `Queue overflow (${(s.queuedBytes / 1024).toFixed(
                    1
                )} KB), dropped oldest chunk`
            );
        }
    }
}

function flushQueue(sourceBuffer: SourceBuffer, s: PlayerState) {
    if (!sourceBuffer || sourceBuffer.updating) return;
    const nextChunk = s.chunkQueue.shift();
    if (nextChunk) {
        s.queuedBytes -= nextChunk.byteLength;
        try {
            sourceBuffer.appendBuffer(nextChunk);
        } catch (error) {
            console.error("Error flushing queue:", error);
            // Put it back on failure
            s.chunkQueue.unshift(nextChunk);
            s.queuedBytes += nextChunk.byteLength;
        }
    }
}

export class WebsocketVideoH264Player {
    private videoElement: HTMLVideoElement;
    private state: PlayerState;
    private sourceBuffer?: SourceBuffer;
    private mediaSource?: MediaSource;
    private objectURL?: string;
    private sourceOpenHandler?: () => void;
    private updateendHandler?: () => void;
    private isDestroyed = false;

    constructor(videoElement: HTMLVideoElement) {
        this.videoElement = videoElement;
        this.state = {
            chunkQueue: [],
            queuedBytes: 0,
            hasPlayed: false,
            live_edge_threshold: INIT_LIVE_EDGE_THRESHOLD,
            seek_hysteresis: INIT_SEEK_HYSTERESIS,
        };
    }

    private cleanup() {
        console.log("Cleaning up MediaSource resources");

        // Remove source buffer event listeners
        if (this.sourceBuffer && this.updateendHandler) {
            try {
                this.sourceBuffer.removeEventListener("updateend", this.updateendHandler);
            } catch (e) {
                console.warn("Error removing updateend listener:", e);
            }
        }

        // Clean up MediaSource
        if (this.mediaSource) {
            if (this.sourceOpenHandler) {
                this.mediaSource.removeEventListener("sourceopen", this.sourceOpenHandler);
                this.sourceOpenHandler = undefined;
            }

            // Only try to close if not already closed
            if (this.mediaSource.readyState !== "closed") {
                try {
                    // Remove all source buffers
                    if (this.mediaSource.sourceBuffers.length > 0) {
                        for (let i = this.mediaSource.sourceBuffers.length - 1; i >= 0; i--) {
                            try {
                                this.mediaSource.removeSourceBuffer(this.mediaSource.sourceBuffers[i]!);
                            } catch (e) {
                                console.warn("Error removing source buffer:", e);
                            }
                        }
                    }
                    this.mediaSource.endOfStream();
                } catch (e) {
                    console.warn("Error ending MediaSource stream:", e);
                }
            }
            this.mediaSource = undefined;
        }

        // Clean up video element
        this.videoElement.pause();
        this.videoElement.removeAttribute('src');
        this.videoElement.load();

        // Revoke object URL
        if (this.objectURL) {
            URL.revokeObjectURL(this.objectURL);
            this.objectURL = undefined;
        }

        // Reset state
        this.sourceBuffer = undefined;
        this.state = {
            chunkQueue: [],
            queuedBytes: 0,
            hasPlayed: false,
            live_edge_threshold: INIT_LIVE_EDGE_THRESHOLD,
            seek_hysteresis: INIT_SEEK_HYSTERESIS,
        };
    }

    private setup() {
        const MSE = (window as any).ManagedMediaSource || window.MediaSource;
        if (!MSE) {
            console.error("MediaSource not supported");
            return;
        }

        console.log("Setting up MediaSource...");

        const mediaSource = new MSE();
        this.mediaSource = mediaSource;

        this.sourceOpenHandler = () => {
            console.log("MediaSource opened");
        };
        mediaSource.addEventListener("sourceopen", this.sourceOpenHandler);

        this.objectURL = URL.createObjectURL(mediaSource);
        this.videoElement.src = this.objectURL;

        this.state.mediaSource = mediaSource;
    }

    private createSourceBuffer(fullCodec: string) {
        if (!this.mediaSource) {
            console.error("MediaSource not initialized");
            return;
        }

        console.log('Creating SourceBuffer with codec:', fullCodec);
        try {
            const sb = this.mediaSource.addSourceBuffer(fullCodec);
            sb.mode = "segments";

            this.updateendHandler = () => {
                if (this.isDestroyed) return;

                try {
                    console.log("SourceBuffer updateend event");
                    seekToLiveEdge(sb, this.state, this.videoElement);
                    trimBuffer(sb, this.videoElement);
                    flushQueue(sb, this.state);

                    if (!this.state.hasPlayed && this.videoElement.paused && this.videoElement.readyState >= 2) {
                        console.log("Auto-playing video (first time)");
                        this.videoElement.play();
                        this.state.hasPlayed = true;
                        this.state.live_edge_threshold = 6;
                        this.state.seek_hysteresis = 4;
                    }
                } catch (e) {
                    console.warn("Error in updateend handler:", e);
                }
            };

            sb.addEventListener("updateend", this.updateendHandler);
            this.sourceBuffer = sb;
            flushQueue(sb, this.state);
        } catch (error) {
            console.error("Error creating SourceBuffer:", error);
        }
    }

    handleCodec(fullCodec: string) {
        if (this.isDestroyed) return;

        console.log("Received codec info:", fullCodec);

        // Clean up previous MediaSource before creating new one
        this.cleanup();
        this.setup();

        if (!MediaSource.isTypeSupported(fullCodec)) {
            console.error("Codec not supported:", fullCodec);
            return;
        }

        console.log("Codec is supported");

        // Wait for MediaSource to be ready
        if (this.mediaSource?.readyState === 'open') {
            this.createSourceBuffer(fullCodec);
        } else if (this.mediaSource) {
            const handler = () => {
                if (!this.isDestroyed && this.mediaSource) {
                    this.createSourceBuffer(fullCodec);
                    this.mediaSource.removeEventListener('sourceopen', handler);
                }
            };
            this.mediaSource.addEventListener('sourceopen', handler);
        }
    }

    handleChunk(chunk: Uint8Array<ArrayBuffer>) {
        console.log('Received chunk of size:', chunk.byteLength);
        if (this.isDestroyed) return;
        addChunk(this.sourceBuffer, this.state, chunk);
    }

    destroy() {
        console.log("Destroying WebsocketVideoH264Player");
        this.isDestroyed = true;
        this.cleanup();
    }
}