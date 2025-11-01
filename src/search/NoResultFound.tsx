import { BsSearch } from "solid-icons/bs";
import { FaSolidCloud } from "solid-icons/fa";

function NoResultIcon() {
    return (
        <div class=" flex items-center -space-x-4">
            <FaSolidCloud class="w-14 h-14 text-neutral-700" />
            <BsSearch class="w-7 h-7 text-white translate-y-1" />
        </div>
    );
}
export default function NoResultFound() {
    return <div class="flex items-center h-full justify-center">
        <div class="flex flex-col items-center ">
            <NoResultIcon />
            <div class="font-medium mt-2">No results found</div>
            <div class="text-center text-neutral-500 mt-1">
                We couldn't find any results.
                <br />
                Try adjusting your search or use different keywords.
            </div>
            <button class="mt-6 border border-neutral-800 rounded-lg hover:bg-neutral-800 transition-all duration-100 px-4 py-2 drop-shadow-2xl bg-neutral-900">
                Clear search
            </button>
        </div>
    </div>
}