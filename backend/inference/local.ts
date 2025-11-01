// Download models
// Load models
import * as ort from 'onnxruntime-node';
import { join } from "path"
import fs from "fs/promises"
import { existsSync, readFileSync } from "fs"
import { buffersFromPaths, detect_objects, type ModelConfig, postprocess, preprocess, type PreprocessorConfig } from "./object_detection"
import { MODELS_DIR } from '../appdir';
import { logger } from '../logger';

const MODEL_FILES = [
    'd_fine/onnx/model.onnx',
    'd_fine/config.json',
    'd_fine/preprocessor_config.json',
]
// parent of appConfig.path

logger.info(`Models directory: ${MODELS_DIR}`);

const backend_url = 'https://backend.zapdoslabs.com';
const models_uri = MODEL_FILES.map(f => ({
    remote: backend_url + '/api/v1/models' + '/' + f,
    local: join(MODELS_DIR, f)
}))


async function downloadFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to download ${url}: ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    await fs.mkdir(join(dest, '..'), { recursive: true });
    await fs.writeFile(dest, Buffer.from(arrayBuffer));
}


let model_downloaded_promise: Promise<void> | null = null;
let model_downloaded_promise_resolve: (() => void) | null = null;
export async function downloadModelFile() {
    if (model_downloaded_promise) {
        return model_downloaded_promise;
    }
    model_downloaded_promise = new Promise((resolve) => {
        model_downloaded_promise_resolve = resolve;
    });

    for (const uri of models_uri) {
        const url = uri.remote;
        const file_path = uri.local;
        if (existsSync(file_path)) continue;
        logger.info(`Downloading model file: ${url}`);
        await downloadFile(url, file_path);
    }

    model_downloaded_promise_resolve?.();
}

export async function loadObjectDetectionModel() {
    await model_downloaded_promise;
    if (!existsSync(join(MODELS_DIR, 'd_fine/onnx/model.onnx'))) {
        throw new Error('Model file does not exist. Please run the CLI to download the model files.');
    }
    const MODEL_PATH = join(MODELS_DIR, 'd_fine/onnx/model.onnx');
    const CONFIG_PATH = join(MODELS_DIR, 'd_fine/config.json');
    const PREPROCESSOR_CONFIG_PATH = join(MODELS_DIR, 'd_fine/preprocessor_config.json');

    const configStr = readFileSync(CONFIG_PATH, 'utf-8')
    const modelConfig: ModelConfig = JSON.parse(configStr);
    const preprocessorStr = readFileSync(PREPROCESSOR_CONFIG_PATH, 'utf-8');
    const preprocessorConfig: PreprocessorConfig = JSON.parse(preprocessorStr);


    const id2label = modelConfig.id2label;
    const { width: modelWidth, height: modelHeight } = preprocessorConfig.size;
    const session = await ort.InferenceSession.create(MODEL_PATH);
    return { session, id2label, modelWidth, modelHeight, preprocessorConfig };
}

export type ObjectDetectionModel = Awaited<ReturnType<typeof loadObjectDetectionModel>>

export async function warmup(imagePaths: string[], model: ObjectDetectionModel) {
    const buffers = await buffersFromPaths(imagePaths);
    const detections = await detect_objects(buffers, model);
    detections.forEach((result, index) => {
        logger.info(`\nResults for ${imagePaths[index]}:`);
        if (result.length > 0) {
            console.table(result);
        } else {
            logger.info("No objects detected with high confidence.");
        }
    });
}



