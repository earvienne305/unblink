
import { createEffect, onMount, untrack, type ValidComponent } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { ServerEphemeralState } from '~/shared';
import ArkToast from './ark/ArkToast';
import Authed from './Authed';
import HistoryContent from './content/HistoryContent';
import HomeContent from './content/HomeContent';
import MomentsContent from './content/MomentsContent';
import SearchContent from './content/SearchContent';
import SearchResultContent from './content/SearchResultContent';
import SettingsContent from './content/SettingsContent';
import { cameras, conn, fetchCameras, setAgentCards, setConn, setMotionMessages, subscription, tab, type Tab } from './shared';
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
            const max_length = MAX_MOTION_MESSAGES_LENGTH_EACH * untrack(cameras).length;
            setMotionMessages(data.motion_energy_messages.slice(-max_length) || []);
        } catch (error) {
            console.error('Error fetching global state from server:', error);
        }
    })

    createEffect(() => {
        const m = newMessage();
        if (!m) return;

        if (m.type === 'frame_motion_energy') {
            // console.log("Motion energy data received in MotionBar:", m);
            const max_length = MAX_MOTION_MESSAGES_LENGTH_EACH * untrack(cameras).length;
            setMotionMessages(prev => [...prev, m].slice(-max_length)); // Keep last 100 messages
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
            // console.log('Received description for stream', m.stream_id, ':', m.description);
            setAgentCards(prev => {
                return [...prev, m.media_unit].slice(-200);
            });
        }
    })

    createEffect(() => {
        const c = conn();
        const _subscription = subscription();
        if (!c) return;
        c.send({ type: 'set_subscription', subscription: _subscription });

    })

    const components = (): Record<Tab['type'], ValidComponent> => {
        return {
            'home': HomeContent,
            'moments': MomentsContent,
            'view': ViewContent,
            'history': HistoryContent,
            'search': SearchContent,
            'search_result': SearchResultContent,
            'settings': SettingsContent,
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