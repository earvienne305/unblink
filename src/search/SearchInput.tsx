import { BsSearch } from "solid-icons/bs";
import { AiOutlineEnter } from "solid-icons/ai";
import { untrack } from "solid-js/web";

export default function SearchInput(props: {
  query: () => string;
  setQuery: (q: string) => void;
  isOpen: () => boolean;
  variant: () => "md" | "lg" | 'xl';
  placeholder: () => string;
  onSubmit: (query: string) => void;
}) {
  return <div
    data-variant={props.variant()}
    data-open={props.isOpen()}
    class="relative  h-10 data-[variant=lg]:h-16 data-[variant=xl]:h-18 data-[open=true]:text-xl data-[open=true]:h-12 data-[open=true]:data-[variant=lg]:h-20  data-[open=true]:data-[variant=xl]:h-20 group "
  >
    <div
      data-open={props.isOpen()}
      data-variant={props.variant()}
      class="absolute top-1/2 -translate-y-1/2 left-0 h-full flex items-center pl-4 data-[open=true]:pl-4 data-[variant=xl]:pl-6"
    >
      <BsSearch
        data-open={props.isOpen()}
        class="w-5 h-5 data-[open=true]:w-6 data-[open=true]:h-6 text-neutral-400 group-hover:text-white  transition-all duration-100 "
      />
    </div>

    <div
      data-open={props.isOpen()}
      class="h-full flex items-center justify-center data-[open=true]:justify-end relative"
    >
      <div
        data-open={props.isOpen()}
        class="absolute top-7 right-4 data-[open=false]:hidden">
        <button
          onClick={() => {
            props.onSubmit(untrack(props.query));
          }}
          class="text-neutral-600 flex items-center space-x-1 hover:bg-neutral-800 hover:text-white px-2 py-1 rounded-md">
          <div class="text-sm font-semibold">Enter</div>
          <AiOutlineEnter class="w-5 h-5 " />
        </button>
      </div>

      <input
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            props.onSubmit(untrack(props.query));
          }
        }}
        value={props.query()}
        onInput={(e) => {
          props.setQuery(e.currentTarget.value);
        }}
        data-open={props.isOpen()}
        data-variant={props.variant()}
        class="w-[calc(100%-3rem)] 
                  data-[variant=lg]:text-xl
                  data-[variant=xl]:text-xl
                  h-full  placeholder:text-neutral-400  transition-all duration-100  px-2 focus:outline-none text-center data-[open=true]:text-left min-w-0"
        placeholder={props.isOpen() ? "" : props.placeholder()}
      />
    </div>
  </div>
}