import { type BunPlugin } from "bun";
import { transformAsync } from "@babel/core";
import solid from "babel-preset-solid";
import ts from "@babel/preset-typescript";
import { readFile } from "fs/promises";

// Define a more specific type for the solid options if you have them
export type SolidPluginOptions = Parameters<typeof solid>[1];

export function SolidPlugin(options: SolidPluginOptions = {}): BunPlugin {
    return {
        name: "bun-plugin-solid",
        async setup(build) {
            build.onLoad({ filter: /\.(t|j)sx$/ }, async (args) => {
                const code = await readFile(args.path, "utf8");

                // Use Babel to transform the code
                const result = await transformAsync(code, {
                    presets: [
                        // The solid preset needs to know the options
                        [solid, options],
                        // The typescript preset handles TS syntax
                        [ts, { onlyRemoveTypeImports: true }],
                    ],
                    filename: args.path, // Filename is important for Babel to know how to parse
                    sourceMaps: "inline",
                });

                // If babel fails, throw an error
                if (!result?.code) {
                    throw new Error(`Babel transformation failed for ${args.path}`);
                }

                return {
                    contents: result.code,
                    loader: "js", // Return as plain JavaScript
                };
            });
        },
    };
}

const solidPlugin = SolidPlugin({
    generate: "dom",
    hydratable: true,
});

// The options are now passed directly to the babel preset
export default solidPlugin;