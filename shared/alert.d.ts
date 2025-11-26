import type { SegmentationMessage } from ".";

// Webhook Contract
export type WebhookMessage = ({
    event: 'description',
    media_id: string;
    media_unit_id: string;
    description: string;
} | SegmentationMessage) & {
    created_at: string;
}