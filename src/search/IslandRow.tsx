import { format, formatDuration, intervalToDuration } from "date-fns";
import { BiSolidCctv } from "solid-icons/bi";
import { createSignal, For, Show } from "solid-js";

import { getTemporallySpaced } from "./utils";
import type { Island } from "../SearchResultContent";

export default function IslandRow(props: {
    island: Island;
    selectItem: (item: Island) => void;
}) {

    const name = () => 'Unknown Camera';


    const desc = () => {
        const removePrefixes = [
            "This image depicts",
            "The image depicts",
            "The image shows",
            "This image shows",
            "The image captures",
            "This image captures",
        ];
        let d = props.island[0]!.description?.trim();
        if (!d || d.length === 0) return;
        for (const prefix of removePrefixes) {
            if (d.startsWith(prefix)) {
                d = d.slice(prefix.length).trim();
                // capitalize first letter
                if (d.length > 0) {
                    d = d.charAt(0).toUpperCase() + d.slice(1);
                }
            }
        }

        return d;
    };


    const duration = () => {
        const start = new Date(props.island[0]!.at_time);
        const end = new Date(props.island[props.island.length - 1]!.at_time);
        const durationObject = intervalToDuration({ start, end });
        const str = formatDuration(durationObject);
        console.log(str);
        return str;
    };

    const representative = () => {
        return getTemporallySpaced(props.island);
    };

    const [barPosition, setBarPosition] = createSignal(0);
    const [isHovering, setIsHovering] = createSignal(false);
    const [closestItemIndex, setClosestItemIndex] = createSignal(0);
    const setClosestItemToBar = (percent: number) => {
        const time_range = new Date(props.island[props.island.length - 1]!.at_time).getTime() - new Date(props.island[0]!.at_time).getTime();
        const time_at_bar = new Date(props.island[0]!.at_time).getTime() + percent * time_range;
        const closestItem = props.island.reduce((prev, curr, index) => {
            const prevTime = new Date(prev.at_time).getTime();
            const currTime = new Date(curr.at_time).getTime();
            const prevDiff = Math.abs(prevTime - time_at_bar);
            const currDiff = Math.abs(currTime - time_at_bar);
            return (currDiff < prevDiff) ? curr : prev;
        });
        const index = props.island.findIndex(item => item.id === closestItem.id);

        setClosestItemIndex(index);
    }

    const closestItem = () => {
        return props.island[closestItemIndex()]!;
    }



    const imgUrl = () => {
        const item = closestItem();
        return `/api/v1/storage?id=${encodeURIComponent(item.id)}&raw=1`
    }


    return (
        <div
            class="p-6 bg-neutral-800 space-x-4 rounded-3xl group text-white"
            onClick={() => {
                // setIsOpen(false);
                props.selectItem(props.island);
            }}
        >
            <div class="flex-1">
                <div class="flex items-center space-x-2 py-2 ">
                    <BiSolidCctv class="w-4 h-4 " />
                    <div>{name()}</div>
                    <div>•</div>
                    {/* start time */}
                    <div class="text-sm">{
                        format(
                            props.island[0]!.at_time,
                            "eeee, MMMM do, yyyy 'at' h:mm a"
                        )}
                    </div>
                </div>

                <div>{desc()}</div>

                <div class="py-4 flex items-center">
                    <Show when={duration()}>
                        <div class="text-xs text-[#a3eeef] border border-[#4c6f73] rounded-full bg-[#28393e] px-2 py-1">
                            {/* Rounded to 2 decimal places */}
                            {duration()}
                        </div>
                    </Show>
                </div>
            </div>

            <div class="flex-none h-full w-full">
                <div class="aspect-video w-full object-cover rounded-2xl bg-neutral-800 overflow-hidden">
                    <Show when={imgUrl()}>
                        {(u) => (
                            <img src={u()} class="w-full h-full object-cover" />
                        )}
                    </Show>
                </div>
            </div>

            <div class=" mt-4  cursor-pointer  w-full">
                {/* The event listener is on this div */}
                <div class="p-2 bg-neutral-700 hover:bg-neutral-600 rounded-3xl relative group"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => {
                        setIsHovering(false);
                        setClosestItemToBar(0);
                    }}
                    onMouseMove={(e) => {
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const clampedX = Math.max(0, Math.min(x, rect.width));
                        setBarPosition(clampedX);
                        const percent = clampedX / rect.width;
                        setClosestItemToBar(percent);
                    }}
                >
                    {/* The white bar that follows the mouse */}
                    <div class="w-0.5 h-full bg-white pointer-events-none absolute " style={{
                        left: `${barPosition()}px`,
                        top: 0,
                        bottom: 0,
                        opacity: isHovering() ? 1 : 0,
                        transition: 'opacity 0.3s',
                    }} >
                        <div class="bg-black px-2 py-1 text-sm absolute top-0 -translate-y-full whitespace-nowrap">{format(closestItem().at_time, "h:mm:ss a")}</div>
                    </div>

                    {/* Container for the images */}
                    <div class="h-20 rounded-2xl flex items-center overflow-hidden">
                        <For each={representative()}>
                            {item => (
                                <div class="h-full flex-1">
                                    <div>
                                        <img src={`/api/v1/storage?id=${encodeURIComponent(item.id)}&raw=1`} class="w-full h-full object-cover" />
                                    </div>
                                </div>
                            )}
                        </For>
                    </div>
                </div>
            </div>
        </div>
    );

}