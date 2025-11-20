import { createResizeObserver } from "@solid-primitives/resize-observer";
import { Tooltip } from "@ark-ui/solid/tooltip";
import { FaSolidEye, FaSolidEyeSlash } from "solid-icons/fa";
import { createEffect, createSignal, For, Show } from "solid-js";
import type { FrameStatsMessage } from "~/shared";
import { statsMessages } from "./shared";
import { getStreamColor } from "./utils/colors";

type MotionCanvasProps = {
    viewedMedias: () => {
        stream_id: string;
        file_name?: string | undefined;
    }[];
    cameras: () => { id: string; name: string }[];
}
function MotionCanvas(props: MotionCanvasProps) {
    let canvasRef: HTMLCanvasElement | undefined;
    let containerRef: HTMLDivElement | undefined;

    const [size, setSize] = createSignal({ width: 0, height: 0 });

    // Observe container size and update a signal
    createResizeObserver(() => containerRef, ({ width, height }) => {
        setSize({ width, height });
    });

    // Drawing effect - re-runs when size or statsMessages changes
    createEffect(() => {
        const { width, height } = size();

        if (!canvasRef || width === 0 || height === 0) {
            return;
        }

        const ctx = canvasRef.getContext('2d');
        if (!ctx) return;

        // Collect all messages for viewed streams
        const allMessages: FrameStatsMessage[] = [];
        for (const media of props.viewedMedias()) {
            if (!media.file_name) { // Only live streams
                const messages = statsMessages[media.stream_id] || [];
                allMessages.push(...messages);
            }
        }

        // Sort by timestamp to interleave messages from different streams
        allMessages.sort((a, b) => a.timestamp - b.timestamp);

        if (allMessages.length === 0) {
            // Clear canvas
            canvasRef.width = Math.floor(width);
            canvasRef.height = Math.floor(height);
            return;
        }

        // Find max energy for scaling
        let maxEnergy = 0;
        for (const msg of allMessages) {
            if (msg.motion_energy > maxEnergy) {
                maxEnergy = msg.motion_energy;
            }
        }

        // Set canvas resolution
        const canvasWidth = Math.floor(width);
        const canvasHeight = Math.floor(height);
        canvasRef.width = canvasWidth;
        canvasRef.height = canvasHeight;

        const barWidth = canvasWidth / allMessages.length;
        const barSpacing = Math.min(barWidth * 0.2, 2);
        const effectiveBarWidth = Math.max(0.5, barWidth - barSpacing);

        // Draw bars
        allMessages.forEach((msg, idx) => {
            const x = idx * barWidth + barSpacing / 2;
            const energyRatio = maxEnergy > 0 ? msg.motion_energy / maxEnergy : 0;
            const barHeight = energyRatio * canvasHeight;
            const yTop = Math.round(canvasHeight - barHeight);
            const h = canvasHeight - yTop;

            const colors = getStreamColor(msg.stream_id);
            ctx.fillStyle = colors.base;
            ctx.fillRect(x, yTop, effectiveBarWidth, h);
        });

        // Draw average lines per stream
        const streamPaths: Record<string, {
            totalAvg: { x: number, y: number }[],
            sma10: { x: number, y: number }[],
            colors: ReturnType<typeof getStreamColor>
        }> = {};

        allMessages.forEach((msg, idx) => {
            const x = idx * barWidth + barSpacing / 2 + effectiveBarWidth / 2;
            const streamId = msg.stream_id;

            if (!streamPaths[streamId]) {
                streamPaths[streamId] = {
                    totalAvg: [],
                    sma10: [],
                    colors: getStreamColor(streamId)
                };
            }

            const totalAvgRatio = maxEnergy > 0 ? msg.total_avg / maxEnergy : 0;
            const totalAvgY = canvasHeight - (totalAvgRatio * canvasHeight);
            streamPaths[streamId]!.totalAvg.push({ x, y: totalAvgY });

            const sma10Ratio = maxEnergy > 0 ? msg.sma10 / maxEnergy : 0;
            const sma10Y = canvasHeight - (sma10Ratio * canvasHeight);
            streamPaths[streamId]!.sma10.push({ x, y: sma10Y });
        });

        // Draw lines for each stream
        Object.values(streamPaths).forEach(paths => {
            // Draw Total Average line
            if (paths.totalAvg.length > 0) {
                ctx.beginPath();
                ctx.strokeStyle = paths.colors.shades[300];
                ctx.lineWidth = 1.5;

                if (paths.totalAvg.length === 1) {
                    ctx.moveTo(0, paths.totalAvg[0]!.y);
                    ctx.lineTo(canvasWidth, paths.totalAvg[0]!.y);
                } else {
                    ctx.moveTo(0, paths.totalAvg[0]!.y);
                    for (let i = 0; i < paths.totalAvg.length; i++) {
                        ctx.lineTo(paths.totalAvg[i]!.x, paths.totalAvg[i]!.y);
                    }
                    ctx.lineTo(canvasWidth, paths.totalAvg[paths.totalAvg.length - 1]!.y);
                }
                ctx.stroke();
            }

            // Draw SMA-10 line
            if (paths.sma10.length > 0) {
                ctx.beginPath();
                ctx.strokeStyle = paths.colors.shades[200];
                ctx.lineWidth = 1.5;

                if (paths.sma10.length === 1) {
                    ctx.moveTo(0, paths.sma10[0]!.y);
                    ctx.lineTo(canvasWidth, paths.sma10[0]!.y);
                } else {
                    ctx.moveTo(0, paths.sma10[0]!.y);
                    for (let i = 0; i < paths.sma10.length; i++) {
                        ctx.lineTo(paths.sma10[i]!.x, paths.sma10[i]!.y);
                    }
                    ctx.lineTo(canvasWidth, paths.sma10[paths.sma10.length - 1]!.y);
                }
                ctx.stroke();
            }
        });
    });

    return (
        <div class="pt-2 border border-neu-800 bg-neu-900 rounded-2xl overflow-hidden relative h-24 cursor-default">
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
                />
            </div>
        </div>
    );
}

export default function ActivityBar(props: {
    viewedMedias: () => {
        stream_id: string;
        file_name?: string | undefined;
    }[];
    cameras: () => { id: string; name: string }[];
}) {
    const [show, setShow] = createSignal(true);
    const [tooltipOpen, setTooltipOpen] = createSignal(false);

    // Get stream info for tooltip
    const getStreamInfo = () => {
        const streams: { name: string, color: string }[] = [];
        for (const media of props.viewedMedias()) {
            if (media.file_name) continue;
            const colors = getStreamColor(media.stream_id);
            const camera = props.cameras().find(c => c.id === media.stream_id);
            streams.push({
                name: camera?.name || media.stream_id.slice(0, 8),
                color: colors.base
            });
        }
        return streams;
    };

    return (
        <Tooltip.Root
            open={tooltipOpen()}
            onOpenChange={(details) => setTooltipOpen(details.open)}
            positioning={{
                placement: 'top',
                offset: { mainAxis: 8 }
            }}
        >
            <Tooltip.Trigger class="relative mr-2 mb-2">
                <div class="relative w-full h-full">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShow(p => !p);
                        }}
                        data-show={show()}
                        class="btn-small data-[show=true]:absolute top-1.5 left-1.5 z-20">
                        <Show when={show()} fallback={<FaSolidEyeSlash class="w-4 h-4 " />}>
                            <FaSolidEye class="w-4 h-4 " />
                        </Show>
                        <div>Activity</div>
                    </button>

                    <Show when={show()}>
                        <MotionCanvas viewedMedias={props.viewedMedias} cameras={props.cameras} />
                    </Show>
                </div>
            </Tooltip.Trigger>
            <Tooltip.Positioner>
                <Tooltip.Content class="z-50 px-3 py-2 text-xs font-medium text-white bg-neu-950/90 border border-neu-700 rounded shadow-lg backdrop-blur-sm">
                    <div class="flex flex-col gap-1">
                        <For each={getStreamInfo()}>
                            {(stream) => (
                                <div class="flex items-center gap-2">
                                    <div
                                        class="w-2 h-2 rounded-full"
                                        style={{ "background-color": stream.color }}
                                    />
                                    <span>{stream.name}</span>
                                </div>
                            )}
                        </For>
                    </div>
                </Tooltip.Content>
            </Tooltip.Positioner>
        </Tooltip.Root>
    );
}