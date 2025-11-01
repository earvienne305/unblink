import { createEffect, createSignal, onMount, untrack } from "solid-js";


const PLACEHOLDERS = [
    "people entering the building",
    "total number of guests today",
    "delivery truck arriving",
];


export function usePlaceholder(props: { placeholder?: () => string | undefined | null }) {
    const [placeholder, setPlaceholder] = createSignal("Search");
    createEffect(() => {
        const p = props.placeholder?.()
        if (p) {
            setPlaceholder(p);
        }
    })

    const longestCommonPrefix = (a: string, b: string) => {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) {
            i++;
        }
        return i;
    };

    onMount(async () => {
        if (props.placeholder) return;
        let index = 0;
        while (true) {
            let current = untrack(placeholder);

            const lcpLength = longestCommonPrefix(current, PLACEHOLDERS[index]!);
            while (current.length > lcpLength) {
                setPlaceholder(current.slice(0, -1));
                current = untrack(placeholder);
                await new Promise((r) => setTimeout(r, 30));
            }

            while (current.length < PLACEHOLDERS[index]!.length) {
                setPlaceholder(PLACEHOLDERS[index]!.slice(0, current.length + 1));
                current = untrack(placeholder);
                await new Promise((r) => setTimeout(r, 50));
            }

            await new Promise((r) => setTimeout(r, 2000));

            index = (index + 1) % PLACEHOLDERS.length;
        }
    });

    return {
        placeholder,
    };
}