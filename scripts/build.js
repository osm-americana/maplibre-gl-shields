import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import esbuild from "esbuild";

const suppressErrors = () => process.exit(1);

const buildWith = async (key, buildOptions) => {
  await mkdir("dist", { recursive: true });

  const esmOptions = {
    entryPoints: ["src/index.ts"],
    format: "esm",
    bundle: true,
    minify: true,
    sourcemap: true,
    outfile: "dist/index.js",
    logLevel: "info",
    ...buildOptions,
    define: {
      ...buildOptions?.define,
    },
  };

  // Browser/CDN build: plain <script> tag exposes mapLibreShieldGenerator.
  const iifeOptions = {
    entryPoints: ["src/index.ts"],
    format: "iife",
    globalName: "mapLibreShieldGenerator",
    bundle: true,
    minify: true,
    sourcemap: true,
    outfile: "dist/maplibre-shield-generator.js",
    logLevel: "info",
    ...buildOptions,
    define: {
      ...buildOptions?.define,
    },
  };

  const headlessOptions = {
    entryPoints: ["src/headless_graphics.ts"],
    format: "esm",
    bundle: true,
    minify: true,
    sourcemap: true,
    outfile: "dist/headless.js",
    platform: "node",
    // Keep node-canvas out of the browser bundle; Node consumers provide it.
    external: ["canvas"],
    logLevel: "info",
    ...buildOptions,
    define: {
      ...buildOptions?.define,
    },
  };

  // esbuild will pretty-print its own error messages;
  // suppress node.js from printing the exception.
  return await Promise.all([
    esbuild[key](esmOptions).catch(suppressErrors),
    esbuild[key](iifeOptions).catch(suppressErrors),
    esbuild[key](headlessOptions).catch(suppressErrors),
  ]);
};

export const buildContext = (buildOptions = {}) =>
  buildWith("context", buildOptions);

export const build = (buildOptions = {}) => buildWith("build", buildOptions);

const mainModule = pathToFileURL(process.argv[1]).toString();

await build({});
