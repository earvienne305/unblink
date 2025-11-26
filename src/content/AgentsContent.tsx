import { createSignal, For, onMount, Show } from 'solid-js';
import { FiTrash, FiEye } from "solid-icons/fi";
import { toaster } from "../ark/ArkToast";
import { authorized_as_admin, agents, agentsLoading, fetchAgents, setAgents } from "../shared";
import LayoutContent from "./LayoutContent";

export default function AgentsContent() {
    onMount(fetchAgents);

    const handleDeleteAgent = async (agentId: string, agentName: string) => {
        toaster.promise(async () => {
            const response = await fetch(`/agents/${agentId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setAgents(prev => prev.filter(agent => agent.id !== agentId));
            } else {
                throw new Error('Failed to delete agent');
            }
        }, {
            loading: {
                title: 'Deleting...',
                description: `Deleting agent "${agentName}".`,
            },
            success: {
                title: 'Success!',
                description: `Agent "${agentName}" has been deleted.`,
            },
            error: {
                title: 'Failed',
                description: 'There was an error deleting the agent. Please try again.',
            },
        });
    };

    return <LayoutContent title="Agents">
        <Show when={!agentsLoading()} fallback={
            <div class="h-full flex items-center justify-center">
                <div class="text-neu-500">Loading agents...</div>
            </div>
        }>
            <Show when={agents().length > 0} fallback={
                <div class="h-full flex items-center justify-center text-neu-500">
                    <div>
                        <FiEye class="mb-4 w-12 h-12" />
                        <p>No agents found</p>
                        <p>Create your first agent to get started</p>
                    </div>
                </div>
            }>
                <div class="relative overflow-x-auto h-full">
                    <table class="w-full text-sm text-left text-neu-400">
                        <thead class="text-neu-400 font-normal">
                            <tr class="">
                                <th scope="col" class="px-6 py-3 font-medium">
                                    Agent Name
                                </th>
                                <th scope="col" class="px-6 py-3 font-medium">
                                    Instruction
                                </th>
                                <Show when={authorized_as_admin()}>
                                    <th scope="col" class="px-6 py-3 font-medium">
                                        Actions
                                    </th>
                                </Show>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={agents()}>
                                {(agent) => (
                                    <tr class="border-b bg-neu-900 border-neu-800">
                                        <td class="px-6 py-4 font-medium text-white">
                                            {agent.name}
                                        </td>
                                        <td class="px-6 py-4 max-w-[40vw]">
                                            <span class="line-clamp-2 break-all">{agent.instruction}</span>
                                        </td>
                                        <Show when={authorized_as_admin()}>
                                            <td class="px-6 py-4">
                                                <button
                                                    onClick={() => handleDeleteAgent(agent.id, agent.name)}
                                                    class="text-neu-500 hover:text-red-400 transition-colors p-1"
                                                    title="Delete agent"
                                                >
                                                    <FiTrash class="w-4 h-4" />
                                                </button>
                                            </td>
                                        </Show>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            </Show>
        </Show>
    </LayoutContent>
}