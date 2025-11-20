import { createResizeObserver } from "@solid-primitives/resize-observer";
import { FaSolidEye, FaSolidEyeSlash } from "solid-icons/fa";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import type { FrameMotionEnergyMessage } from "~/shared/engine";
import { motionMessages } from "./shared";



import { getStreamColor } from "./utils/colors";

// Cache for message stats to ensure stability
type MessageStats = {
    totalAvg: number;
    sma10: number;
};
const messageStatsCache = new WeakMap<FrameMotionEnergyMessage, MessageStats>();

// Running stats for each stream to allow incremental calculation
type StreamStats = {
    sum: number;
    count: number;
    last10: number[];
};
const streamRunningStats = new Map<string, StreamStats>();

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

    // 4. Memoize the final, structured chart data.
    // Re-runs only when filteredMessages changes.
    const chartData = createMemo(() => {
        const messages = filteredMessages();
        if (messages.length === 0) {
            return { bars: [], maxEnergy: 0 };
        }

        let maxTotalEnergy = 0;

        const bars = messages.map(msg => {
            if (msg.motion_energy > maxTotalEnergy) {
                maxTotalEnergy = msg.motion_energy;
            }

            const streamId = msg.stream_id || 'unknown';

            // Calculate or retrieve cached stats
            let stats = messageStatsCache.get(msg);
            if (!stats) {
                let streamStats = streamRunningStats.get(streamId);
                if (!streamStats) {
                    streamStats = { sum: 0, count: 0, last10: [] };
                    streamRunningStats.set(streamId, streamStats);
                }

                // Update running stats
                streamStats.sum += msg.motion_energy;
                streamStats.count += 1;
                streamStats.last10.push(msg.motion_energy);
                if (streamStats.last10.length > 10) {
                    streamStats.last10.shift();
                }

                // Calculate averages
                const totalAvg = streamStats.sum / streamStats.count;
                const sma10 = streamStats.last10.reduce((a, b) => a + b, 0) / streamStats.last10.length;

                stats = { totalAvg, sma10 };
                messageStatsCache.set(msg, stats);
            }

            const colors = getStreamColor(streamId);
            return {
                energy: msg.motion_energy,
                color: colors.base,
                streamId: streamId,
                stats: stats,
                colors: colors
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
            // Use floor to ensure integer dimensions
            const canvasWidth = Math.floor(width);
            const canvasHeight = Math.floor(height);

            canvasRef!.width = canvasWidth;
            canvasRef!.height = canvasHeight;

            if (bars.length === 0) {
                return; // Nothing to draw
            }

            const barWidth = canvasWidth / bars.length;
            const barSpacing = Math.min(barWidth * 0.2, 2);
            const effectiveBarWidth = Math.max(0.5, barWidth - barSpacing);

            // Draw bars
            bars.forEach((bar, idx) => {
                const x = idx * barWidth + barSpacing / 2;

                const energyRatio = maxEnergy > 0 ? bar.energy / maxEnergy : 0;
                const barHeight = energyRatio * canvasHeight;

                // Snap coordinates to integers for crisp edges
                const yTop = Math.round(canvasHeight - barHeight);
                const h = canvasHeight - yTop;

                ctx.fillStyle = bar.color;
                ctx.fillRect(x, yTop, effectiveBarWidth, h);
            });

            // Draw moving average curves
            // We need to draw separate paths for each stream
            const streamPaths: Record<string, { totalAvg: { x: number, y: number }[], sma10: { x: number, y: number }[], colors: ReturnType<typeof getStreamColor> }> = {};

            bars.forEach((bar, idx) => {
                const x = idx * barWidth + barSpacing / 2 + effectiveBarWidth / 2; // Center of the bar

                if (!streamPaths[bar.streamId]) {
                    streamPaths[bar.streamId] = { totalAvg: [], sma10: [], colors: bar.colors };
                }

                const totalAvgRatio = maxEnergy > 0 ? bar.stats.totalAvg / maxEnergy : 0;
                const totalAvgY = canvasHeight - (totalAvgRatio * canvasHeight);
                streamPaths[bar.streamId]!.totalAvg.push({ x, y: totalAvgY });

                const sma10Ratio = maxEnergy > 0 ? bar.stats.sma10 / maxEnergy : 0;
                const sma10Y = canvasHeight - (sma10Ratio * canvasHeight);
                streamPaths[bar.streamId]!.sma10.push({ x, y: sma10Y });
            });

            Object.values(streamPaths).forEach(paths => {
                // Draw Total Average Curve
                if (paths.totalAvg.length > 1) {
                    ctx.beginPath();
                    ctx.strokeStyle = paths.colors.shades[300];
                    ctx.lineWidth = 1.5;
                    ctx.moveTo(paths.totalAvg[0]!.x, paths.totalAvg[0]!.y);
                    for (let i = 1; i < paths.totalAvg.length; i++) {
                        ctx.lineTo(paths.totalAvg[i]!.x, paths.totalAvg[i]!.y);
                    }
                    ctx.stroke();
                }

                // Draw SMA-10 Curve
                if (paths.sma10.length > 1) {
                    ctx.beginPath();
                    ctx.strokeStyle = paths.colors.shades[200];
                    ctx.lineWidth = 1.5;
                    ctx.moveTo(paths.sma10[0]!.x, paths.sma10[0]!.y);
                    for (let i = 1; i < paths.sma10.length; i++) {
                        ctx.lineTo(paths.sma10[i]!.x, paths.sma10[i]!.y);
                    }
                    ctx.stroke();
                }
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