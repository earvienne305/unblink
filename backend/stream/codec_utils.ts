import type { AVPixelFormat, AVSampleFormat, Stream } from "node-av";
import {
    AV_CODEC_ID_MJPEG,
    AV_PIX_FMT_BGR24,
    AV_PIX_FMT_BGR4,
    AV_PIX_FMT_BGR4_BYTE,
    AV_PIX_FMT_BGR8,
    AV_PIX_FMT_GRAY8,
    AV_PIX_FMT_MONOBLACK,
    AV_PIX_FMT_MONOWHITE,
    AV_PIX_FMT_PAL8,
    AV_PIX_FMT_RGB24,
    AV_PIX_FMT_RGB4,
    AV_PIX_FMT_RGB4_BYTE,
    AV_PIX_FMT_RGB8,
    AV_PIX_FMT_UYVY422,
    AV_PIX_FMT_UYYVYY411,
    AV_PIX_FMT_YUV410P,
    AV_PIX_FMT_YUV411P,
    AV_PIX_FMT_YUV420P,
    AV_PIX_FMT_YUV422P,
    AV_PIX_FMT_YUV444P,
    AV_PIX_FMT_YUVJ420P,
    AV_PIX_FMT_YUVJ422P,
    AV_PIX_FMT_YUVJ444P,
    AV_PIX_FMT_YUYV422,
    avGetCodecStringHls,
    avGetMimeTypeDash,
} from "node-av";
import type { StreamMessage } from "~/shared";

/**
 * Generates codec information for streaming
 */
export function getCodecs(
    width: number,
    height: number,
    videoStream: Stream,
    audioStream: Stream | undefined,
): StreamMessage {
    const videoCodecString = avGetCodecStringHls(videoStream.codecpar);
    const audioCodecString = audioStream
        ? avGetCodecStringHls(audioStream.codecpar)
        : null;

    const codecStrings = audioCodecString
        ? `${videoCodecString},${audioCodecString}`
        : videoCodecString;

    const mimeType = avGetMimeTypeDash(videoStream.codecpar);
    const fullCodec = `${mimeType}; codecs="${codecStrings}"`;

    const codecs: StreamMessage = {
        type: "codec",
        mimeType,
        videoCodec: videoCodecString,
        audioCodec: audioCodecString,
        codecString: codecStrings,
        fullCodec,
        width,
        height,
        hasAudio: !!audioStream,
    };

    return codecs;
}

/**
 * Determines if video transcoding can be skipped based on codec and format
 */
export function shouldSkipTranscode(videoStream: Stream): boolean {
    const SUPPORTED_FORMATS: (AVPixelFormat | AVSampleFormat)[] = [
        AV_PIX_FMT_YUV420P,
        AV_PIX_FMT_YUYV422,
        AV_PIX_FMT_RGB24,
        AV_PIX_FMT_BGR24,
        AV_PIX_FMT_YUV422P,
        AV_PIX_FMT_YUV444P,
        AV_PIX_FMT_YUV410P,
        AV_PIX_FMT_YUV411P,
        AV_PIX_FMT_GRAY8,
        AV_PIX_FMT_MONOWHITE,
        AV_PIX_FMT_MONOBLACK,
        AV_PIX_FMT_PAL8,
        AV_PIX_FMT_YUVJ420P,
        AV_PIX_FMT_YUVJ422P,
        AV_PIX_FMT_YUVJ444P,
        AV_PIX_FMT_UYVY422,
        AV_PIX_FMT_UYYVYY411,
        AV_PIX_FMT_BGR8,
        AV_PIX_FMT_BGR4,
        AV_PIX_FMT_BGR4_BYTE,
        AV_PIX_FMT_RGB8,
        AV_PIX_FMT_RGB4,
        AV_PIX_FMT_RGB4_BYTE
    ];

    const isMjpeg = videoStream.codecpar.codecId === AV_CODEC_ID_MJPEG;
    const hasCompatibleFormat = SUPPORTED_FORMATS.includes(videoStream.codecpar.format);

    return isMjpeg && hasCompatibleFormat;
}
