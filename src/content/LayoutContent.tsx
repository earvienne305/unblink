import { FaSolidChevronLeft } from "solid-icons/fa";
import { Show } from "solid-js";
import { canGoBackTab, goBackTab } from "../shared";

export default function LayoutContent(props: {
    title: string,
    children?: any
    hide_head?: boolean
    head_tail?: any
    show_back_button?: boolean
}) {
    const hide_head = () => props.hide_head || false;
    return <div class="flex flex-col h-screen py-2 overflow-hidden">
        <Show when={!hide_head()}>
            <div class="flex-none h-14 flex items-center px-4 mb-2 bg-neu-900 border-neu-800 border rounded-2xl mr-2">
                <Show when={props.show_back_button && canGoBackTab()}>
                    <button
                        class="opacity-30 hover:opacity-100 transition-opacity mr-4"
                        onClick={() => {
                            goBackTab();
                        }}
                    >
                        <FaSolidChevronLeft class="w-5 h-5" />
                    </button>
                </Show>
                <div class="text-lg font-medium">{props.title}</div>
                {props.head_tail}
            </div>
        </Show>
        <div class="flex-1 overflow-hidden">
            <div class="border-neu-800 border rounded-2xl h-full mr-2 bg-neu-900 overflow-hidden max-h-full">
                {props.children}
            </div>
        </div>
    </div>
}