import { Database } from '@tursodatabase/database';
import { batch_exec } from './utils';

export async function onboardMedia(db: Database) {
    await batch_exec({
        db,
        table: 'media',
        entries: [
            {
                name: "St. Catherine's School",
                uri: "https://bucket.zapdoslabs.com/st_catherine_school.mp4",
                labels: ["Excavation"]
            },
            {
                name: "Home Construction Site",
                uri: "https://bucket.zapdoslabs.com/home.mp4",
                labels: ["Remodeling"]
            },
            {
                name: "National Museum",
                uri: "https://bucket.zapdoslabs.com/museum.mp4",
                labels: ["Remodeling"]
            },
        ],
        statement: `
            INSERT INTO media (id, name, uri, labels, updated_at, save_to_disk, save_location) 
            VALUES (?, ?, ?, ?, ?, 0, NULL);
        `,
        transform: (entry) => {
            const id = crypto.randomUUID();
            const labelsStr = JSON.stringify(entry.labels);
            const updatedAt = Date.now();
            return [id, entry.name, entry.uri, labelsStr, updatedAt];
        }

    })
}

export async function onboardSettings(db: Database) {
    await batch_exec({
        db,
        table: 'settings',
        entries: [
            { key: 'object_detection_enabled', value: 'true' },
            { key: 'auth_enabled', value: 'false' },
        ],
        statement: `
            INSERT INTO settings (key, value) 
            VALUES (?, ?);
        `,
        transform: (entry) => {
            return [entry.key, entry.value];
        }
    })
}
