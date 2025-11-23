export type StreamMomentState = {
    should_write_moment: boolean;
    current_moment_id?: string;
    discard_previous_maybe_moment?: boolean;
}

export type WorkerState = {
    streams: Map<string, StreamMomentState>;
}
