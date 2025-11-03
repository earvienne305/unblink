import { createSignal } from "solid-js";
import type { Conn } from "./video/connection";
import type { Subscription } from "~/shared";
import { toaster } from "./ark/ArkToast";

export type Camera = {
    id: string;
    name: string;
    uri: string;
    labels: string[];
    updated_at: string;
    saveToDisk: boolean;
    saveDir: string;
};

export const [tabId, setTabId] = createSignal<string>('home');
export const [cameras, setCameras] = createSignal<Camera[]>([]);
export const [camerasLoading, setCamerasLoading] = createSignal(true);
export const [subscription, setSubscription] = createSignal<Subscription>();
export const [conn, setConn] = createSignal<Conn>();
export const [viewedMedias, setViewedMedias] = createSignal<{
    stream_id: string;
    file_name?: string;
}[]>([]);

export const [settings, setSettings] = createSignal<Record<string, string>>({});

export const fetchSettings = async () => {
    try {
        const response = await fetch("/settings");
        const data = await response.json();
        const settingsMap: Record<string, string> = {};
        for (const setting of data) {
            settingsMap[setting.key] = setting.value;
        }
        setSettings(settingsMap);
    } catch (error) {
        console.error("Error fetching settings:", error);
    }
};

export const saveSettings = async (newSettings: Record<string, string>) => {
    toaster.promise(async () => {
        for (const key in newSettings) {
            await fetch("/settings", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ key, value: newSettings[key] }),
            });
        }
        await fetchSettings(); // Refresh settings after saving
    }, {
        loading: {
            title: 'Saving...',
            description: 'Your settings are being saved.',
        },
        success: {
            title: 'Success!',
            description: 'Settings have been saved successfully.',
        },
        error: {
            title: 'Failed',
            description: 'There was an error saving your settings. Please try again.',
        },
    })
};


export const fetchCameras = async () => {
    setCamerasLoading(true);
    try {
        const response = await fetch('/media');
        if (response.ok) {
            const data = await response.json();
            setCameras(data);
        } else {
            console.error('Failed to fetch media');
            setCameras([]);
        }
    } catch (error) {
        console.error('Error fetching media:', error);
        setCameras([]);
    } finally {
        setCamerasLoading(false);
    }
};