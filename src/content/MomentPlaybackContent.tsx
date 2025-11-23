import { createEffect, createResource, createSignal, onCleanup, Show } from "solid-js";
import { v4 as uuid } from 'uuid';
import LayoutContent from "./LayoutContent";
import type { Moment } from "../../shared/database";
import { cameras, setSubscription, subscription, tab } from "../shared";
import CanvasVideo from "../CanvasVideo";

const fetchMoment = async (id: string): Promise<Moment> => {
    const response = await fetch("/moments");
    if (!response.ok) {
        throw new Error("Failed to fetch moments");
    }
    const moments: Moment[] = await response.json();
    const moment = moments.find(m => m.id === id);
    if (!moment) {
        throw new Error("Moment not found");
    }

    console.log('moment', moment);
    return moment;
};

export default function MomentPlaybackContent() {
    const currentTab = tab();
    const momentId = currentTab.type === 'moment_playback' ? currentTab.moment_id : '';

    const [moment] = createResource(() => momentId, fetchMoment);
    const [showDetections] = createSignal(false); // Moments don't have object detection

    // Get camera name for display
    const cameraName = () => {
        const m = moment();
        if (!m) return undefined;
        const camera = cameras().find(c => c.id === m.media_id);
        return camera?.name;
    };

    // Handle subscription for moment playback
    createEffect(() => {
        const m = moment();
        if (m && m.clip_path) {
            console.log('Setting up moment playback subscription for:', momentId);
            const session_id = uuid();

            setSubscription({
                session_id,
                streams: [{
                    type: 'ephemeral' as const,
                    kind: 'moment' as const,
                    id: momentId
                }]
            });
        }
    });

    // Cleanup subscription on unmount
    onCleanup(() => {
        console.log('MomentPlaybackContent unmounting, clearing subscription');
        setSubscription(undefined);
    });

    return (
        <LayoutContent title="Moment Playback">
            <div class="h-full flex flex-col">
                <Show when={!moment.loading && moment()} fallback={
                    <div class="flex-1 flex items-center justify-center text-neu-400">
                        Loading moment...
                    </div>
                }>
                    {(m) => (
                        <>
                            {/* Moment Info Header */}
                            <div class="p-4 bg-neu-900 border-b border-neu-800">
                                <h2 class="text-xl font-semibold text-neu-100 mb-1">
                                    {m().title || "Untitled Moment"}
                                </h2>
                                <p class="text-sm text-neu-400">
                                    {m().short_description || "No description available"}
                                </p>
                                <div class="mt-2 text-xs text-neu-500">
                                    <span>{new Date(m().start_time).toLocaleString()}</span>
                                    {m().end_time && (
                                        <span class="ml-4">
                                            Duration: {Math.round((m().end_time - m().start_time) / 1000)}s
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Video Player */}
                            <div class="flex-1 bg-black">
                                <Show
                                    when={m().clip_path}
                                    fallback={
                                        <div class="h-full flex items-center justify-center text-neu-400">
                                            No video clip available for this moment
                                        </div>
                                    }
                                >
                                    <CanvasVideo
                                        id={momentId}
                                        showDetections={showDetections}
                                        name={cameraName}
                                    />
                                </Show>
                            </div>

                            {/* Additional Details */}
                            <Show when={m().long_description}>
                                <div class="p-4 bg-neu-900 border-t border-neu-800">
                                    <h3 class="text-sm font-semibold text-neu-200 mb-2">Details</h3>
                                    <p class="text-sm text-neu-400">{m().long_description}</p>
                                </div>
                            </Show>
                        </>
                    )}
                </Show>
            </div>
        </LayoutContent>
    );
}
