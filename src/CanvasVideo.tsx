import { createResizeObserver } from "@solid-primitives/resize-observer";
import { FaSolidSpinner } from "solid-icons/fa";
import { createEffect, createSignal, onCleanup, onMount, Show, type Accessor } from "solid-js";
import { newMessage } from "./video/connection";
import type { ServerToClientMessage, Subscription, SegmentationMessage } from "~/shared";
import { subscription } from "./shared";

type SegmentationData = {
    objects: number[];
    scores: number[];
    boxes: number[][];
    masks: Array<{
        size: [number, number];
        counts: number[] | string;
    }>;
};

class MjpegPlayer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private img: HTMLImageElement | null = null;
    private segmentationData: SegmentationData | null = null;
    private animationFrameId = 0;
    private isDestroyed = false;
    private sourceWidth = 0;
    private sourceHeight = 0;
    private onDrawingStateChange: (isDrawing: boolean) => void;
    public _showSegmentation = true;
    public cameraName: string | undefined;
    public rounded: boolean;
    private onTimestamp?: (timestamp: number) => void;

    constructor(
        canvas: HTMLCanvasElement,
        onDrawingStateChange: (isDrawing: boolean) => void,
        rounded: boolean = false,
        onTimestamp?: (timestamp: number) => void
    ) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.onDrawingStateChange = onDrawingStateChange;
        this.rounded = rounded;
        this.onTimestamp = onTimestamp;
        this.startRenderLoop();
    }

    public handleMessage(message: ServerToClientMessage): void {
        if (this.isDestroyed) return;

        if (message.type === 'segmentation') {
            this.segmentationData = {
                objects: message.objects,
                scores: message.scores,
                boxes: message.boxes,
                masks: message.masks,
            };
            return;
        }

        if (message.type === 'codec') {
            this.sourceWidth = message.width;
            this.sourceHeight = message.height;
            return;
        }

        if (message.type === 'frame' && message.data) {
            const blob = new Blob([message.data as any], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            const img = new Image();
            img.onload = () => {
                if (this.img) {
                    URL.revokeObjectURL(this.img.src);
                }
                this.img = img;
                if (!this.sourceWidth || !this.sourceHeight) {
                    this.sourceWidth = img.naturalWidth;
                    this.sourceHeight = img.naturalHeight;
                }
                this.onDrawingStateChange(true);
            };
            img.src = url;

            if (message.timestamp !== undefined && this.onTimestamp) {
                this.onTimestamp(message.timestamp);
            }
        }
    }

    private render = (one_time: boolean = false) => {
        if (this.isDestroyed) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.img) {
            const geom = this.calculateRenderGeometry();

            const x = geom.offsetX;
            const y = geom.offsetY;
            const w = geom.renderWidth;
            const h = geom.renderHeight;

            this.ctx.save();

            if (this.rounded) {
                const r = 16;
                this.ctx.beginPath();
                this.ctx.moveTo(x + r, y);
                this.ctx.lineTo(x + w - r, y);
                this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                this.ctx.lineTo(x + w, y + h - r);
                this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                this.ctx.lineTo(x + r, y + h);
                this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                this.ctx.lineTo(x, y + r);
                this.ctx.quadraticCurveTo(x, y, x + r, y);
                this.ctx.closePath();
                this.ctx.clip();
            }

            this.ctx.drawImage(
                this.img,
                geom.offsetX,
                geom.offsetY,
                geom.renderWidth,
                geom.renderHeight
            );
            this.ctx.restore();

            if (this._showSegmentation) {
                this.drawSegmentation(geom);
            }

            this.drawCameraName(geom);
        }

        if (!one_time) {
            this.animationFrameId = requestAnimationFrame(() => this.render());
        }

    }

    private calculateRenderGeometry() {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const videoWidth = this.sourceWidth || this.img?.naturalWidth || 1;
        const videoHeight = this.sourceHeight || this.img?.naturalHeight || 1;

        const canvasAspect = canvasWidth / canvasHeight;
        const videoAspect = videoWidth / videoHeight;

        let renderWidth: number, renderHeight: number, offsetX: number, offsetY: number;

        if (canvasAspect > videoAspect) {
            renderHeight = canvasHeight;
            renderWidth = renderHeight * videoAspect;
            offsetX = (canvasWidth - renderWidth) / 2;
            offsetY = 0;
        } else {
            renderWidth = canvasWidth;
            renderHeight = renderWidth / videoAspect;
            offsetX = 0;
            offsetY = (canvasHeight - renderHeight) / 2;
        }

        return { renderWidth, renderHeight, offsetX, offsetY };
    }

    private decodeMaskRLE(mask: { size: [number, number]; counts: number[] | string }): Uint8Array {
        const [height, width] = mask.size;
        const decoded = new Uint8Array(height * width);
        const counts = Array.isArray(mask.counts) ? mask.counts : JSON.parse(mask.counts);
        
        let pos = 0;
        // SAM3 RLE convention: alternates between 0 and 1, starting with 0
        // First run is for value 0 (background), second for value 1 (foreground), etc.
        let val = 0;
        
        for (let i = 0; i < counts.length; i++) {
            const count = counts[i];
            
            // Fill 'count' pixels with current value
            for (let j = 0; j < count; j++) {
                if (pos < decoded.length) {
                    decoded[pos++] = val;
                }
            }
            
            // Toggle value for next run
            val = 1 - val;  // Toggle between 0 and 1
        }
        
        return decoded;
    }

    private drawSegmentation(geom: { renderWidth: number; renderHeight: number; offsetX: number; offsetY: number }) {
        if (!this.segmentationData || this.segmentationData.objects.length === 0 || !this.sourceWidth || !this.sourceHeight) return;

        const videoWidth = this.sourceWidth;
        const videoHeight = this.sourceHeight;

        // Independent X/Y scaling for letterboxing
        const scaleX = geom.renderWidth / videoWidth;
        const scaleY = geom.renderHeight / videoHeight;

        this.ctx.save();
        
        // Ensure proper alpha blending
        this.ctx.globalCompositeOperation = 'source-over';

        // Define colors for different objects
        const colors = [
            'rgba(255, 0, 0, 0.4)',    // Red
            'rgba(0, 255, 0, 0.4)',    // Green
            'rgba(0, 0, 255, 0.4)',    // Blue
            'rgba(255, 255, 0, 0.4)',  // Yellow
            'rgba(255, 0, 255, 0.4)',  // Magenta
            'rgba(0, 255, 255, 0.4)',  // Cyan
        ];

        this.segmentationData.masks.forEach((mask, idx) => {
            const objectId = this.segmentationData!.objects[idx];
            const score = this.segmentationData!.scores[idx];
            const box = this.segmentationData!.boxes[idx];
            
            if (objectId === undefined || score === undefined || !box || box.length < 4) return;
            
            // Decode RLE mask
            const decodedMask = this.decodeMaskRLE(mask);
            const [maskHeight, maskWidth] = mask.size;
            
            // Get bounding box coordinates (in mask coordinate space)
            const x_min = box[0] || 0;
            const y_min = box[1] || 0;
            const x_max = box[2] || 0;
            const y_max = box[3] || 0;
            
            // Calculate scale factors based on MASK dimensions, not video dimensions
            // This ensures bounding boxes align with the mask rendering
            const maskScaleX = geom.renderWidth / maskWidth;
            const maskScaleY = geom.renderHeight / maskHeight;

            // Count mask pixels and calculate tight bounding box from actual mask
            let maskPixelCount1 = 0;
            let maskPixelCount0 = 0;
            let minX = maskWidth;
            let minY = maskHeight;
            let maxX = 0;
            let maxY = 0;
            
            for (let i = 0; i < decodedMask.length; i++) {
                const val = decodedMask[i];
                if (val !== undefined) {
                    if (val > 0) maskPixelCount1++;
                    else maskPixelCount0++;
                }
            }
            
            // Determine which value represents the object (use the smaller count)
            const useValueZero = maskPixelCount0 < maskPixelCount1;
            const objectPixelCount = useValueZero ? maskPixelCount0 : maskPixelCount1;
            
            // Skip if no mask pixels (empty mask)
            if (objectPixelCount === 0) {
                console.warn(`Object ${objectId}: Empty mask`);
                return;
            }
            
            // Calculate tight bounding box from actual mask pixels
            for (let y = 0; y < maskHeight; y++) {
                for (let x = 0; x < maskWidth; x++) {
                    const i = y * maskWidth + x;
                    const val = decodedMask[i];
                    const isObject = useValueZero ? (val === 0) : (val !== undefined && val > 0);
                    
                    if (isObject) {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                }
            }
            
            // Use calculated bounding box instead of the one from SAM3
            const tight_x_min = minX;
            const tight_y_min = minY;
            const tight_x_max = maxX + 1; // +1 to make it inclusive
            const tight_y_max = maxY + 1;
            
            console.log(`Object ${objectId}: ${objectPixelCount} pixels (${(objectPixelCount/decodedMask.length*100).toFixed(2)}%), ` +
                       `SAM3 box: [${x_min.toFixed(0)}, ${y_min.toFixed(0)}, ${x_max.toFixed(0)}, ${y_max.toFixed(0)}], ` +
                       `Tight box: [${tight_x_min}, ${tight_y_min}, ${tight_x_max}, ${tight_y_max}]`);
            
            // Create an off-screen canvas for the mask
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = maskWidth;
            maskCanvas.height = maskHeight;
            const maskCtx = maskCanvas.getContext('2d')!;
            const imageData = maskCtx.createImageData(maskWidth, maskHeight);

            // Color the mask
            const color = colors[objectId % colors.length] || colors[0] || 'rgba(255, 0, 0, 0.4)';
            const rgb = color.match(/\d+/g)?.map(Number) || [255, 0, 0];
            
            for (let i = 0; i < decodedMask.length; i++) {
                const maskVal = decodedMask[i];
                // Color pixels that represent the object (determined above)
                const isObject = useValueZero ? (maskVal === 0) : (maskVal !== undefined && maskVal > 0);
                if (isObject) {
                    const idx4 = i * 4;
                    imageData.data[idx4] = rgb[0] || 255;     // R
                    imageData.data[idx4 + 1] = rgb[1] || 0;   // G
                    imageData.data[idx4 + 2] = rgb[2] || 0;   // B
                    imageData.data[idx4 + 3] = 102;           // A (0.4 * 255)
                }
            }

            maskCtx.putImageData(imageData, 0, 0);

            // Draw the mask scaled to match the video rendering
            this.ctx.drawImage(
                maskCanvas,
                0, 0, maskWidth, maskHeight,
                geom.offsetX, geom.offsetY, geom.renderWidth, geom.renderHeight
            );

            // Draw bounding box using tight bounds calculated from mask
            const scaledX = geom.offsetX + tight_x_min * maskScaleX;
            const scaledY = geom.offsetY + tight_y_min * maskScaleY;
            const scaledWidth = (tight_x_max - tight_x_min) * maskScaleX;
            const scaledHeight = (tight_y_max - tight_y_min) * maskScaleY;

            const strokeColor = colors[objectId % colors.length]?.replace('0.4', '1') || 'rgba(255, 0, 0, 1)';
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(
                Math.floor(scaledX),
                Math.floor(scaledY),
                Math.floor(scaledWidth),
                Math.floor(scaledHeight)
            );

            // Draw label
            const text = `Object ${objectId} (${(score * 100).toFixed(1)}%)`;
            this.ctx.font = '14px Arial';
            this.ctx.textBaseline = 'bottom';
            const textMetrics = this.ctx.measureText(text);
            const textWidth = textMetrics.width;
            const textHeight = 15;

            const labelY = scaledY > textHeight + 5
                ? scaledY
                : scaledY + scaledHeight + textHeight;

            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(
                Math.floor(scaledX),
                Math.floor(labelY - textHeight),
                Math.ceil(textWidth + 10),
                Math.ceil(textHeight + 2)
            );

            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillText(text, scaledX + 5, labelY);
        });

        this.ctx.restore();
    }

    private drawCameraName(geom: { renderWidth: number; renderHeight: number; offsetX: number; offsetY: number }) {
        if (!this.cameraName) return;

        this.ctx.save();
        this.ctx.font = '16px Arial';
        this.ctx.textBaseline = 'bottom';
        this.ctx.textAlign = 'left';

        const padding = 10;
        const x = geom.offsetX + padding;
        const y = geom.offsetY + geom.renderHeight - padding;

        // Optional: Add a subtle shadow for better visibility
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;

        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText(this.cameraName, x, y);

        this.ctx.restore();
    }

    private startRenderLoop() {
        this.animationFrameId = requestAnimationFrame(() => this.render());
    }

    public updateCanvasSize(width: number, height: number) {
        if (this.isDestroyed) return;
        this.canvas.width = width;
        this.canvas.height = height;
    }

    public destroy() {
        this.isDestroyed = true;
        cancelAnimationFrame(this.animationFrameId);
        if (this.img) {
            URL.revokeObjectURL(this.img.src);
            this.img = null;
        }
        console.log("MjpegPlayer destroyed.");
    }

    set showSegmentation(value: boolean) {
        this._showSegmentation = value;
        // Draw immediately to reflect change
        this.render(true);
    }

    public setCameraName(name: string) {
        this.cameraName = name;
        this.render(true);
    }
}

export default function CanvasVideo(props: { id: string, showDetections: Accessor<boolean>, name?: Accessor<string | undefined>, rounded?: boolean, onTimestamp?: (timestamp: number) => void }) {
    const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement>();
    const [containerRef, setContainerRef] = createSignal<HTMLDivElement>();
    const [isDrawing, setIsDrawing] = createSignal(false);

    let player: MjpegPlayer | null = null;

    createEffect(() => {
        const sd = props.showDetections();
        if (!player) return;
        player.showSegmentation = sd;
    });

    createEffect(() => {
        const name = props.name?.();
        if (player && name) {
            player.setCameraName(name);
        }
    });

    createEffect(() => {
        const canvas = canvasRef();
        if (canvas && !player) {
            player = new MjpegPlayer(canvas, setIsDrawing, props.rounded ?? false, props.onTimestamp);
            const name = props.name?.();
            if (name) {
                player.setCameraName(name);
            }
        }
    });

    createEffect(() => {
        const s = subscription();
        if (!s) return;

        const stream_sub = s.streams.find(stream => stream.id === props.id);
        if (!stream_sub) return;

        const ses_id = stream_sub.type === 'ephemeral' ? stream_sub.session_id : undefined;

        const message = newMessage();
        if (!message) return;
        const isCorrectStreamMessage = (message.type == 'frame' || message.type == 'codec') && message.id === props.id && message.session_id === ses_id;
        const isCorrectSegmentationMessage = message.type == 'segmentation' && message.media_id === props.id && message.session_id === ses_id;

        if (isCorrectStreamMessage || isCorrectSegmentationMessage) {
            player?.handleMessage(message);
        }
    });

    createEffect(() => {
        const container = containerRef();
        if (!container) return;
        createResizeObserver(container, ({ width, height }) => {
            if (width > 0 && height > 0) {
                player?.updateCanvasSize(width, height);
            }
        });
    });

    onMount(() => setIsDrawing(false));

    onCleanup(() => {
        player?.destroy();
        player = null;
    });

    return (
        <div ref={setContainerRef}
            style={{ position: "relative", width: "100%", height: "100%" }}
        >
            <canvas
                ref={setCanvasRef}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    display: "block"
                }}
            />
            <Show when={!isDrawing()}>
                <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: "white"
                }}>
                    <div class="animate-spin">
                        <FaSolidSpinner size={48} />
                    </div>
                </div>
            </Show>
        </div>
    );
}