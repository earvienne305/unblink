import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { type ObjectDetectionModel } from './local';


// --- TYPE DEFINITIONS ---
// Defines the structure of preprocessor_config.json for type safety
export interface PreprocessorConfig {
    size: {
        height: number;
        width: number;
    };
    do_rescale: boolean;
    rescale_factor: number;
}

// Defines the structure of config.json
export interface ModelConfig {
    id2label: Record<string, string>;
}

// Defines the structure for a single detection result
export interface DetectionResult {
    label: string;
    score: string;
    box: string[];
}


// --- PRE-PROCESSING ---
export async function preprocess(imageBuffers: Buffer[], config: PreprocessorConfig): Promise<ort.Tensor> {
    const { size, do_rescale, rescale_factor } = config;
    const modelHeight = size.height;
    const modelWidth = size.width;
    const batchSize = imageBuffers.length;

    const batchTensorData = new Float32Array(batchSize * 3 * modelHeight * modelWidth);

    for (let i = 0; i < batchSize; i++) {
        const imageBuffer = await sharp(imageBuffers[i])
            .resize(modelWidth, modelHeight, { fit: 'contain', background: { r: 128, g: 128, b: 128 } })
            .removeAlpha()
            .raw()
            .toBuffer();

        const offset = i * 3 * modelHeight * modelWidth;
        // HWC to CHW and apply transformations
        for (let h = 0; h < modelHeight; h++) {
            for (let w = 0; w < modelWidth; w++) {
                const pixelOffset = (h * modelWidth + w) * 3;
                let r = imageBuffer[pixelOffset]!;
                let g = imageBuffer[pixelOffset + 1]!;
                let b = imageBuffer[pixelOffset + 2]!;

                if (do_rescale) {
                    r *= rescale_factor;
                    g *= rescale_factor;
                    b *= rescale_factor;
                }

                batchTensorData[offset + (0 * modelHeight * modelWidth) + (h * modelWidth + w)] = r;
                batchTensorData[offset + (1 * modelHeight * modelWidth) + (h * modelWidth + w)] = g;
                batchTensorData[offset + (2 * modelHeight * modelWidth) + (h * modelWidth + w)] = b;
            }
        }
    }

    return new ort.Tensor('float32', batchTensorData, [batchSize, 3, modelHeight, modelWidth]);
}

export async function buffersFromPaths(imagePaths: string[]): Promise<Buffer[]> {
    const imageBuffers = await Promise.all(
        imagePaths.map(async (path) => {
            return await sharp(path).toBuffer();
        })
    );
    return imageBuffers;
}

// --- POST-PROCESSING ---
export function softmax(arr: Float32Array | number[]) {
    const C = Math.max(...arr);
    const d = Array.from(arr.map((y) => Math.exp(y - C))).reduce((a, b) => a + b);
    return arr.map((value) => Math.exp(value - C) / d);
}

export function postprocess(
    results: Record<string, ort.Tensor>,
    id2label: Record<string, string>,
    modelWidth: number,
    modelHeight: number
): DetectionResult[][] {
    const CONFIDENCE_THRESHOLD = 0.9;
    const { logits: logitsTensor, pred_boxes: boxesTensor } = results;

    // Type assertion for safety
    if (!(logitsTensor?.data instanceof Float32Array) || !(boxesTensor?.data instanceof Float32Array)) {
        throw new Error('Unexpected tensor data type');
    }

    const [batchSize, numQueries, numClasses] = logitsTensor.dims;
    const finalResults: DetectionResult[][] = [];

    if (!batchSize || !numQueries || !numClasses) {
        throw new Error("Invalid tensor dimensions");
    }

    for (let i = 0; i < batchSize; i++) {
        const imageDetections: DetectionResult[] = [];
        for (let j = 0; j < numQueries; j++) {
            const logitsOffset = (i * numQueries * numClasses) + (j * numClasses);
            const classLogits = logitsTensor.data.slice(logitsOffset, logitsOffset + numClasses);

            const probabilities = softmax(classLogits);
            const bestClassProb = Math.max(...probabilities.slice(0, -1)); // Exclude the "no object" class

            if (bestClassProb > CONFIDENCE_THRESHOLD) {
                const bestClassId = probabilities.indexOf(bestClassProb);
                const label = id2label[bestClassId.toString()]!;
                const score = bestClassProb;

                const boxOffset = (i * numQueries * 4) + (j * 4);
                const [cx, cy, w, h] = boxesTensor.data.slice(boxOffset, boxOffset + 4);

                const x1 = (cx! - w! / 2) * modelWidth;
                const y1 = (cy! - h! / 2) * modelHeight;
                const x2 = (cx! + w! / 2) * modelWidth;
                const y2 = (cy! + h! / 2) * modelHeight;

                imageDetections.push({
                    label,
                    score: score.toFixed(3),
                    box: [x1.toFixed(0), y1.toFixed(0), x2.toFixed(0), y2.toFixed(0)]
                });
            }
        }
        finalResults.push(imageDetections);
    }
    return finalResults;
}


export async function detect_objects(buffers: Buffer<ArrayBufferLike>[], model: ObjectDetectionModel) {
    const tensor = await preprocess(buffers, model.preprocessorConfig);
    const feeds: Record<string, ort.Tensor> = { [model.session.inputNames[0] as any]: tensor };
    const results = await model.session.run(feeds);
    const detections = postprocess(results, model.id2label, model.modelWidth, model.modelHeight);
    return detections;
}