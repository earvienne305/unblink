import fs from "fs/promises";
import type { CodecContext, MediaOutput } from "node-av";
import { MediaOutput as MediaOutputClass, Rational } from "node-av";
import path from "path";
import { logger as _logger } from "~/backend/logger";

const logger = _logger.child({ worker: 'output-file' });

export type OutputFileObject = {
    output_id: string;
    from: Date;
    mediaOutput: MediaOutput;
    videoFileOutputIndex: number;
    path: string;
    startTime: number | null; // Wall-clock time when first frame was written (ms)
};

export class OutputFile {
    static async create(
        mediaId: string,
        output_id: string,
        codecContext: CodecContext,
        output_type_dir: string
    ): Promise<OutputFileObject> {
        const from = new Date();
        const dir = path.join(output_type_dir, mediaId);
        await fs.mkdir(dir, { recursive: true });
        const filePath = path.join(dir, `${mediaId}_from_${from.getTime()}_ms.mkv`);

        const mediaOutput = await MediaOutputClass.open(filePath, {
            format: 'matroska',
        });

        // Manually add stream to bypass addStream's check on initialized encoders
        const ctx = mediaOutput.getFormatContext();
        if (!ctx) {
            throw new Error("Failed to get format context");
        }

        const stream = ctx.newStream(null);
        if (!stream) {
            throw new Error("Failed to create output stream");
        }

        // Copy codec parameters
        stream.codecpar.fromContext(codecContext);
        // Use millisecond timebase for moment clips (matches our timestamp generation)
        stream.timeBase = new Rational(1, 1000);

        // Write header immediately
        await mediaOutput.getFormatContext().writeHeader();

        return {
            output_id,
            from,
            mediaOutput,
            videoFileOutputIndex: stream.index,
            path: filePath,
            startTime: null
        };
    }

    static async close(obj: OutputFileObject): Promise<string> {
        // Manually write trailer since we bypassed MediaOutput's internal state
        await obj.mediaOutput.getFormatContext().writeTrailer();
        await obj.mediaOutput.close();

        // Rename to have closed_at timestamp
        const to = new Date();
        const mediaId = path.basename(obj.path).split('_from_')[0];
        const newName = `${mediaId}_from_${obj.from.getTime()}_ms_to_${to.getTime()}_ms.mkv`;
        const newPath = path.join(path.dirname(obj.path), newName);
        await fs.rename(obj.path, newPath);
        logger.info({ old: obj.path, new: newPath }, "Closed output file");
        return newPath;
    }

    static async discard(obj: OutputFileObject) {
        // Just close without writing trailer since we are deleting
        await obj.mediaOutput.close();
        try {
            await fs.unlink(obj.path);
        } catch (error) {
            logger.error({ error, path: obj.path }, "Failed to delete false alarm moment file");
        }
    }
}
