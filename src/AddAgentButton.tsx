import { AiOutlineRobot } from 'solid-icons/ai';
import { Dialog } from '@ark-ui/solid/dialog';
import { ArkDialog } from './ark/ArkDialog';
import { createSignal, untrack } from 'solid-js';
import { toaster } from './ark/ArkToast';
import { fetchAgents } from './shared';
import AgentPlusSVG from '~/assets/icons/AgentPlus.svg';

export default function AddAgentButton() {
    const [name, setName] = createSignal('');
    const [instruction, setInstruction] = createSignal('');

    const handleSave = async () => {
        const _name = untrack(name).trim();
        const _instruction = untrack(instruction).trim();
        if (!_name || !_instruction) {
            return;
        }

        toaster.promise(async () => {
            const response = await fetch('/agents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: _name, instruction: _instruction }),
            });

            if (response.ok) {
                setName('');
                setInstruction('');
                fetchAgents(); // Refetch agents after successful creation
            } else {
                throw new Error('Failed to save agent');
            }
        }, {
            loading: {
                title: 'Saving...',
                description: 'Your agent is being added.',
            },
            success: {
                title: 'Success!',
                description: 'Agent has been added successfully.',
            },
            error: {
                title: 'Failed',
                description: 'There was an error adding your agent. Please try again.',
            },
        })
    };

    return <ArkDialog
        trigger={(_, setOpen) => <button
            onClick={() => setOpen(true)}
            class="w-full btn-primary">
            <img src={AgentPlusSVG} class="w-6 h-6" style="filter: brightness(0) invert(1)" />
            <div>
                Create Agent
            </div>
        </button>}
        title="Create a new agent"
        description="Enter the details for your new agent."
    >
        <div class="mt-4 space-y-4">
            <div>
                <label for="agent-name" class="text-sm font-medium text-neu-300">Agent Name</label>
                <input
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    placeholder='Fall Detector'
                    type="text" id="agent-name" class="px-4 py-2 mt-1 block w-full rounded-lg bg-neu-850 border border-neu-750 text-white focus:outline-none placeholder:text-neu-500" />
            </div>
            <div>
                <label for="agent-instruction" class="text-sm font-medium text-neu-300">Instruction</label>
                <textarea
                    value={instruction()}
                    onInput={(e) => setInstruction(e.currentTarget.value)}
                    placeholder='Ensure worker safety. Send alerts when possible fall patterns are detected, or when a worker remains down for an extended period.'
                    id="agent-instruction" class="min-h-52 px-4 py-2 mt-1 block w-full rounded-lg bg-neu-850 border border-neu-750 text-white focus:outline-none placeholder:text-neu-500 resize-none" rows="3" />
            </div>
            <div class="flex justify-end pt-4">
                {/* There should be no asChild here */}
                <Dialog.CloseTrigger>
                    <button
                        onClick={handleSave}
                        class="btn-primary">
                        Create Agent
                    </button>
                </Dialog.CloseTrigger>
            </div>
        </div>
    </ArkDialog>
}