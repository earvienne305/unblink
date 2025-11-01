import type { CompileBuildOptions } from "bun";
import solidPlugin from "./bun-plugin-solid";
import tailwindPlugin from "bun-plugin-tailwind";

import { readdirSync } from "fs";
import path from "path";
// Build for multiple platforms
const platforms: CompileBuildOptions[] = [
    { target: "bun-windows-x64", outfile: "unblink.exe" },
    { target: "bun-linux-x64", outfile: "unblink-linux" },
    { target: "bun-darwin-arm64", outfile: "unblink-macos" },
];

// Find all worker files
const workers: string[] = readdirSync("./backend/worker").filter(file => file.endsWith(".ts"));

for (const platform of platforms) {
    await Bun.build({
        entrypoints: ["./index.ts", ...workers.map(worker => path.join("./backend/worker", worker))],
        plugins: [
            solidPlugin,
            tailwindPlugin,
        ],
        outdir: "./dist",
        compile: platform,
    });
}
