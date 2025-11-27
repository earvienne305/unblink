import type { SegmentationMessage } from ".";

// Webhook Contract
export type WebhookMessage = ({
    event: 'agent_response';
    media_id: string;
    media_unit_id: string;
    content: string;
    agent_id?: string;
    agent_name?: string;
} | SegmentationMessage) & {
    created_at: string;
}