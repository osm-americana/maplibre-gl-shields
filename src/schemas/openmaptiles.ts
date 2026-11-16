import type { ShieldSchema } from "../shield_schema";
import { assertShieldSchema } from "../shield_schema";

/**
 * Built-in schema for OpenMapTiles-style `transportation_name` routes.
 *
 * Expects `route_#_network`, `route_#_ref`, `route_#_name`, and
 * `route_#_color` on each feature (see the README Schema section). Pass this
 * constant to the schema helpers. Override `source` when the style's
 * OpenMapTiles source has another id. Pass `textFont` separately.
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
