import pino from 'pino';
import { ROOT_DIR } from '../definition';
export const logger = pino({
    transport: {
        target: 'pino-pretty'
    },

    // formatters: {
    //     level: (label) => {
    //         return { level: label.toUpperCase() };
    //     },
    // },
    // timestamp: pino.stdTimeFunctions.isoTime,
},
    // pino.destination(`${ROOT_DIR}/app.log`)
)