import type { ShieldSchema } from "../shield_schema";
import { assertShieldSchema } from "../shield_schema";

/**
 * OpenMapTiles `transportation_name` routes.
 *
 * Image ids are shaped like `shield\nnetwork\nref\nname\ncolor`, with
 * properties `route_1_network` through `route_8_color` and a
 * motorway-to-tertiary opacity ramp. Pass this constant to the schema
 * functions. Override `source` when the style's OpenMapTiles source has
 * another id. Pass `textFont` separately.
 *
 * @example
 * ```ts
 * addShieldLayer(map, {
 *   schema: OPENMAPTILES,
 *   sprites: "shields.json",
 *   textFont: ["Noto Sans Regular"],
 * });
 * ```
 */
export const OPENMAPTILES: ShieldSchema = Object.freeze({
  id: "openmaptiles",
  source: "openmaptiles",
  sourceLayer: "transportation_name",
  layerId: "highway-shield",
  routeAttributes: Object.freeze(["network", "ref", "name", "color"]),
  maxConcurrency: 8,
  imagePrefix: "shield",
  attributeSeparator: "\n",
  propertyName: (routeIndex: number, attribute: string) =>
    `route_${routeIndex}_${attribute}`,
  roadClassProperty: "class",
  roadClassOrder: Object.freeze([
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
  ]),
  opacityZooms: Object.freeze([8, 10, 11, 12, 14]),
});

assertShieldSchema(OPENMAPTILES);
