
import { createEffect, onMount, untrack, type ValidComponent } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { FrameStatsMessage, ServerEphemeralState, RESTQuery, MediaUnit } from '~/shared';
import ArkToast from './ark/ArkToast';
import Authed from './Authed';
import HomeContent from './content/HomeContent';
import MomentsContent from './content/MomentsContent';
import MomentPlaybackContent from './content/MomentPlaybackContent';
import SearchContent from './content/SearchContent';
import SearchResultContent from './content/SearchResultContent';
import SettingsContent from './content/SettingsContent';
import AgentsContent from './content/AgentsContent';
import { cameras, conn, fetchCameras, setAgentCards, setConn, setStatsMessages, subscription, tab, viewedMedias, type Tab } from './shared';
import SideBar from './SideBar';
import { connectWebSocket, newMessage } from './video/connection';
import ViewContent from './ViewContent';

const MAX_MOTION_MESSAGES_LENGTH_EACH = 100;

export default function App() {

    onMount(async () => {
        // fetch server's global states
        try {
            const response = await fetch('/state');
            const data: ServerEphemeralState = await response.json();
            console.log('Fetched global state from server:', data);

            // Group messages by media_id
            const messagesByStream: Record<string, FrameStatsMessage[]> = {};
            for (const msg of data.frame_stats_messages) {
                if (!messagesByStream[msg.media_id]) {
                    messagesByStream[msg.media_id] = [];
                }
                messagesByStream[msg.media_id]!.push(msg);
            }

            // Keep only last 100 messages per stream
            for (const mediaId in messagesByStream) {
                messagesByStream[mediaId] = messagesByStream[mediaId]!.slice(-MAX_MOTION_MESSAGES_LENGTH_EACH);
            }

            setStatsMessages(messagesByStream);
            console.log('messagesByStream', messagesByStream)
        } catch (error) {
            console.error('Error fetching global state from server:', error);
        }
    })

    createEffect(() => {
        const m = newMessage();
        if (!m) return;

        if (m.type === 'frame_stats') {
            const mediaId = m.media_id;
            setStatsMessages(mediaId, (prev = []) => {
                const updated = [...prev, m];
                return updated.slice(-MAX_MOTION_MESSAGES_LENGTH_EACH);
            });
        }
    });

    onMount(() => {
        const conn = connectWebSocket();
        setConn(conn);
        fetchCameras();
    })

    createEffect(() => {
        const m = newMessage();
        if (!m) return;

        if (m.type === 'agent_card') {
            // Message already has the AgentCard structure
            const { type, ...agentCard } = m;
            setAgentCards(prev => {
                return [...prev, agentCard].slice(-200);
            });
        }
    })

    createEffect(() => {
        const c = conn();
        const _subscription = subscription();
        if (!c) return;
        c.send({ type: 'set_subscription', subscription: _subscription });

    })

    // Fetch agent cards for all medias (5 for each)
    createEffect(async () => {
        const allCameras = cameras();
        if (!allCameras || allCameras.length === 0) {
            return;
        }

        console.log('Fetching agent cards for all medias:', allCameras);

        // Fetch 5 most recent media units for each camera
        const fetchPromises = allCameras.map(async (camera) => {
            const resp = await fetch('/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: {
                        table: 'media_units',
                        where: [{
                            'field': 'media_id', 'op': 'equals', 'value': camera.id,
                        }, {
                            'field': 'description', 'op': 'is_not', 'value': null
                        }],
                        select: ['id', 'media_id', 'at_time', 'description', 'path', 'type'],
                        limit: 5,
                        order_by: { field: 'at_time', direction: 'DESC' }
                    } as RESTQuery,
                }),
            });

            if (resp.ok) {
                const data = await resp.json() as { media_units: MediaUnit[] };
                // Convert MediaUnits to AgentCards
                return data.media_units.map(unit => ({
                    id: unit.id,
                    content: unit.description || '',
                    media_id: unit.media_id,
                    media_unit_id: unit.id,
                    at_time: unit.at_time,
                    path: unit.path,
                    type: unit.type,
                }));
            } else {
                console.error(`Failed to fetch media units for camera ${camera.id}`);
                return [];
            }
        });

        const results = await Promise.all(fetchPromises);
        const allAgentCards = results.flat();
        console.log('Fetched agent cards for all cameras:', allAgentCards.length);
        setAgentCards(allAgentCards);
    })

    const components = (): Record<Tab['type'], ValidComponent> => {
        return {
            'home': HomeContent,
            'moments': MomentsContent,
            'moment_playback': MomentPlaybackContent,
            'view': ViewContent,
            'search': SearchContent,
            'search_result': SearchResultContent,
            'settings': SettingsContent,
            'agents': AgentsContent,
        }

    }
    const component = () => components()[tab().type]

    return <Authed>
        <div class="h-screen flex items-start bg-neu-925 text-white space-x-2">
            <ArkToast />
            <SideBar />
            <div class="flex-1">
                <Dynamic component={component()} />
            </div>
        </div>
    </Authed>
}