import { createEffect, createSignal, createMemo, Show } from "solid-js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { motionMessages } from "./shared";
import type { FrameMotionEnergyMessage } from "~/shared/engine";
import { FaSolidChevronDown, FaSolidChevronLeft, FaSolidChevronRight, FaSolidChevronUp, FaSolidEye, FaSolidEyeSlash } from "solid-icons/fa";

// This is a global cache. Be mindful that it will persist for the lifetime
// of the app unless manually cleared. For this component's scope, it's acceptable.
const STREAM_COLORS: { [key: string]: string } = {};
const COLOR_PALETTE = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

function getColorForStream(streamId: string): string {
    if (!STREAM_COLORS[streamId]) {
        const colorIndex = Object.keys(STREAM_COLORS).length % COLOR_PALETTE.length;
        STREAM_COLORS[streamId] = COLOR_PALETTE[colorIndex] as string;
    }
    return STREAM_COLORS[streamId];
}

function MotionCanvas(props: {
    viewedMedias: () => {
        stream_id: string;
        file_name?: string | undefined;
    }[]
}) {
    let canvasRef: HTMLCanvasElement | undefined;
    let containerRef: HTMLDivElement | undefined;

    const [size, setSize] = createSignal({ width: 0, height: 0 });

    // 1. Observe container size and update a signal. This is cheap.
    createResizeObserver(() => containerRef, ({ width, height }) => {
        setSize({ width, height });
    });

    // --- Optimization: Reactive Data Pipeline using createMemo ---

    // 2. Memoize the set of viewed stream IDs.
    // Re-runs only when props.viewedMedias changes.
    const viewedStreamIds = createMemo(() => {
        return new Set(props.viewedMedias().map(media => media.stream_id));
    });

    // 3. Memoize the filtered messages.
    // Re-runs only when motionMessages or viewedStreamIds changes.
    const filteredMessages = createMemo(() => {
        const ids = viewedStreamIds();
        return motionMessages().filter(msg => msg.stream_id && ids.has(msg.stream_id));
    });

    // 4. Memoize the final, structured chart data. This is the most expensive part.
    // Re-runs only when filteredMessages changes.
    const chartData = createMemo(() => {
        const messages = filteredMessages();
        if (messages.length === 0) {
            return { bars: [], maxEnergy: 0 };
        }

        // Group messages by frame_id
        const frameData = new Map<string, FrameMotionEnergyMessage[]>();
        const frameOrder: string[] = [];
        messages.forEach(msg => {
            if (!frameData.has(msg.frame_id)) {
                frameData.set(msg.frame_id, []);
                frameOrder.push(msg.frame_id);
            }
            frameData.get(msg.frame_id)!.push(msg);
        });

        // Calculate max total energy for normalization
        let maxTotalEnergy = 0;
        for (const frameMessages of frameData.values()) {
            const totalEnergy = frameMessages.reduce((sum, msg) => sum + msg.motion_energy, 0);
            if (totalEnergy > maxTotalEnergy) {
                maxTotalEnergy = totalEnergy;
            }
        }

        // Prepare data in a render-friendly format
        const bars = frameOrder.map(frameId => {
            const messages = frameData.get(frameId) || [];
            return {
                frameId,
                segments: messages.map(msg => ({
                    energy: msg.motion_energy,
                    color: getColorForStream(msg.stream_id!),
                })),
            };
        });

        return { bars, maxEnergy: maxTotalEnergy };
    });

    // 5. Unified drawing effect.
    // This effect now only handles drawing and re-runs only when chartData or size changes.
    createEffect(() => {
        const { width, height } = size();
        const { bars, maxEnergy } = chartData();

        if (!canvasRef || width === 0 || height === 0) {
            return;
        }

        const ctx = canvasRef.getContext('2d');
        if (!ctx) return;

        // Use a function to contain the drawing logic, called in the next animation frame
        // to ensure the browser is ready to paint.
        const draw = () => {
            // Set canvas resolution. This also clears the canvas.
            canvasRef!.width = width;
            canvasRef!.height = height;

            if (bars.length === 0) {
                return; // Nothing to draw
            }

            const barWidth = width / bars.length;
            const barSpacing = Math.min(barWidth * 0.2, 2);
            const effectiveBarWidth = Math.max(0.5, barWidth - barSpacing);

            bars.forEach((bar, idx) => {
                const x = idx * barWidth + barSpacing / 2;
                let currentY = height;

                bar.segments.forEach(segment => {
                    const energyRatio = maxEnergy > 0 ? segment.energy / maxEnergy : 0;
                    const barHeight = energyRatio * height;

                    ctx.fillStyle = segment.color;
                    ctx.fillRect(x, currentY - barHeight, effectiveBarWidth, barHeight);
                    currentY -= barHeight;
                });
            });
        };

        requestAnimationFrame(draw);
    });

    return <div class="pt-2 border border-neu-800 bg-neu-900 rounded-2xl overflow-hidden relative h-24" >
        <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    "z-index": 10,
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    display: "block"
                }}
            ></canvas>
        </div>
    </div>

}

export default function ActivityBar(props: {
    viewedMedias: () => {
        stream_id: string;
        file_name?: string | undefined;
    }[]
}) {
    const [show, setShow] = createSignal(true);

    return (
        <div class="relative  mr-2 mb-2">
            <button
                onClick={() => setShow(p => !p)}
                data-show={show()}
                class="btn-small data-[show=true]:absolute top-1.5 left-1.5 z-20">
                <Show when={show()} fallback={<FaSolidEyeSlash class="w-4 h-4 " />}>
                    <FaSolidEye class="w-4 h-4 " />
                </Show>
                <div>Activity</div>
            </button>

            <Show when={show()}>
                <MotionCanvas viewedMedias={props.viewedMedias} />
            </Show>

        </div>
    );
}