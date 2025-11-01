
export default function AutocompleteRow(props: {
    item: { text: string };
    selectItem: (item: { text: string }) => void;
}) {

    return (
        <div
            class="p-4 hover:bg-neutral-800 cursor-pointer flex items-start space-x-4"
            onClick={() => {
                // setIsOpen(false);
                props.selectItem(props.item);
            }}
        >
            <div class="flex items-center space-x-2">
                <div>{props.item.text}</div>
            </div>
        </div>
    );

}