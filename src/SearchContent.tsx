import { Show } from "solid-js";
import SearchBar from "./SearchBar";
import { FaSolidClockRotateLeft, FaSolidDisplay } from "solid-icons/fa";
import { setTabId } from "./shared";

export default function SearchContent() {
  return <div class="h-screen py-2 pr-2">
    <div class="flex items-center flex-col space-y-16 relative isolate overflow-auto py-2  bg-neu-900 h-full rounded-2xl border border-neu-800 ">


      <div class="relative z-40">
        <SearchBar variant="lg" />
      </div>

      {/* <div class="text-left w-[40vw] mt-12 space-y-4 relative z-30">
                <button
                    //   onClick={() => {
                    //     setTabId({
                    //       type: "multiview",
                    //       stream_ids: streams(),
                    //     });
                    //   }}
                    class="btn-primary"
                >
                    <FaSolidDisplay class="w-4 h-4" />
                    <div class="">Open All</div>
                </button>

                <div class="grid grid-cols-3 gap-4 ">
                    <For each={streams()}>
            {(stream) => <ParserItem id={() => stream} />}
          </For>
                </div>
            </div> */}
    </div>
  </div>
}