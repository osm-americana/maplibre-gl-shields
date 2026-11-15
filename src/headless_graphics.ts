import type { Bounds, GraphicsFactory } from "./types";
import { createCanvas } from "canvas";

/**
 * Node-only graphics factory backed by node-canvas.
 *
 * Import from `@americana/maplibre-shield-generator/headless`, not the
 * package root, so browser bundles do not pull in the native `canvas`
 * dependency.
 */
export class HeadlessGraphicsFactory implements GraphicsFactory {
  private _type?: "pdf" | "svg";
  constructor(type?: "pdf" | "svg") {
    this._type = type;
  }
  createGraphics(bounds: Bounds): CanvasRenderingContext2D {
    let canvas = this._type
      ? createCanvas(bounds.width, bounds.height, this._type)
      : createCanvas(bounds.width, bounds.height);
    let ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    return ctx as any as CanvasRenderingContext2D;
  }
  pixelRatio(): number {
    return 1;
  }
}
