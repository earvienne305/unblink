// declarations.d.ts

declare module '@babel/core';
declare module 'babel-preset-solid';
declare module '@babel/preset-typescript';

// Bun handles SVG imports natively, but TypeScript needs some help.
declare module '*.svg' {
    const content: any;
    export default content;
}

declare module '*.jpg' {
    const content: any;
    export default content;
}

declare module '*.png' {
    const content: any;
    export default content;
}