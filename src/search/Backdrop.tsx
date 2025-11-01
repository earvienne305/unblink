import { onCleanup, onMount, Show, untrack } from "solid-js";

export default function Backdrop(props: { isOpen: () => boolean, barRef: () => HTMLDivElement | undefined, setIsOpen: (v: boolean) => void }) {

    onMount(() => {
        const listener = (e: MouseEvent) => {
            const bar = untrack(props.barRef);
            if (!bar) return;
            const isInside = bar === e.target || bar.contains(e.target as any);
            props.setIsOpen(isInside);
        };
        onCleanup(() => {
            document.removeEventListener("click", listener);
        });

        document.addEventListener("click", listener);
    });

    return <Show when={props.isOpen()}>
        <div class="fixed h-screen w-screen top-0 left-0 bg-black/80 z-100" />
    </Show>
}