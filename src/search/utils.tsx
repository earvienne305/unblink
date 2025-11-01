import { createSignal } from "solid-js";
import type { Island } from "../SearchResultContent";


export const [state, setState] = createSignal<{
    type: "idle" | "autocompleting";
    query?: string;
    autocomplete?: {
        items: { text: string }[];
    };
}>({
    type: "idle",
});


export const getTemporallySpaced = (island: Island) => {
    // 1. Handle edge cases
    if (!island || island.length <= 5) {
        return island || [];
    }

    // 2. Create a sorted copy of the array
    const sortedIsland = [...island].sort((a, b) => new Date(a.at_time).getTime() - new Date(b.at_time).getTime());
    if (sortedIsland.length === 0) {
        return [];
    }
    const firstTime = new Date(sortedIsland[0]!.at_time).getTime();
    const lastTime = new Date(sortedIsland[sortedIsland.length - 1]!.at_time).getTime();
    const timeRange = lastTime - firstTime;

    // Handle case where all items have the same timestamp
    if (timeRange === 0) {
        return sortedIsland.slice(0, 5);
    }

    // 3. Calculate 5 ideal, evenly-spaced timestamps
    const step = timeRange / 4; // 4 intervals between 5 points
    const idealTimes = Array.from({ length: 5 }, (_, i) => firstTime + i * step);

    const result: Island = [];
    const usedIndices = new Set();

    // 4. For each ideal time, find the best available (non-used) item
    for (const idealTime of idealTimes) {
        let bestItem = null;
        let bestIndex = -1;
        let smallestDiff = Infinity;

        sortedIsland.forEach((item, index) => {
            // Skip items we've already selected
            if (usedIndices.has(index)) {
                return;
            }

            const itemTime = new Date(item.at_time).getTime();
            const diff = Math.abs(itemTime - idealTime);

            if (diff < smallestDiff) {
                smallestDiff = diff;
                bestItem = item;
                bestIndex = index;
            }
        });

        if (bestItem !== null) {
            result.push(bestItem);
            usedIndices.add(bestIndex);
        }
    }

    // 5. Return the final list, sorted by time
    return result.sort((a, b) => new Date(a.at_time).getTime() - new Date(b.at_time).getTime());
};
