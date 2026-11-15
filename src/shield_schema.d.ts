import type {
  ExpressionSpecification,
  Map as MapLibre,
  SymbolLayerSpecification,
} from "maplibre-gl";
import type {
  RouteDefinition,
  RouteParser,
  ShieldSpecification,
  StringPredicate,
} from "./types";
import { AbstractShieldRenderer } from "./shield_renderer";
/**
 * How a vector-tile schema stores route attributes, and how those attributes
 * become missing-image ids.
 *
 * Pass a schema to {@link getShieldExpression}, {@link getShieldLayer},
 * {@link createShieldRenderer}, or {@link addShieldLayer}.
 * {@link OPENMAPTILES} is the built-in schema. Another tile source is a
 * different object with this same shape. {@link OPENMAPTILES} is an ordinary
 * value of this type: the functions read every default from the object you pass.
 *
 * The schema describes tiles and the symbol layer that reads them. Shield
 * graphics, padding, and network definitions stay in the shield specification
 * you pass separately (for example your own `shields.json`). The font stack is
 * also separate, because it belongs to the style rather than to the tile
 * schema. Pass it as `textFont` when building a layer.
 *
 * A schema's image-id expression and its parser are a pair. The missing-image
 * handler has to undo exactly the id the expression wrote.
 */
export interface ShieldSchema {
  /**
   * Name used in error messages. {@link OPENMAPTILES} uses `"openmaptiles"`.
   */
  id: string;
  /** Default MapLibre source id. Override per call when a style renames the source. */
  source: string;
  /** Vector source-layer that carries the route attributes. */
  sourceLayer: string;
  /** Default id of the symbol layer this schema produces. */
  layerId: string;
  /**
   * Route attributes encoded into each image id, in order.
   *
   * The default codec reads `network`, `ref`, and `name` from these names.
   * Further attributes are still written into the id. OpenMapTiles appends
   * `color`, so two features that differ only by color do not share a sprite.
   * The renderer currently paints from network, ref, and name.
   */
  routeAttributes: readonly string[];
  /**
   * How many concurrent routes one feature may carry.
   * OpenMapTiles features have `route_1_*` through `route_8_*`.
   */
  maxConcurrency: number;
  /**
   * Image-id prefix. OpenMapTiles uses `"shield"`, producing ids such as
   * `"shield\nUS:I\n95\n\n"`.
   */
  imagePrefix: string;
  /**
   * Separator inserted before every attribute value.
   * OpenMapTiles uses a newline. The separator must not occur inside values
   * when the default codec is used. An empty separator is only valid together
   * with {@link ShieldSchema.getImageName}, {@link ShieldSchema.parseImageName},
   * and {@link ShieldSchema.formatImageName}.
   */
  attributeSeparator: string;
  /**
   * Tile property for one attribute of one concurrent route.
   *
   * `routeIndex` is 1-based, matching OpenMapTiles (`route_1_network`).
   * The same function is used to test whether a route slot is present and,
   * unless a custom codec is set, to read the values that go into the image id.
   */
  propertyName: (routeIndex: number, attribute: string) => string;
  /**
   * Feature property holding the road class used for sort order and opacity.
   * OpenMapTiles uses `"class"`.
   */
  roadClassProperty: string;
  /**
   * Road classes from highest priority to lowest.
   *
   * The symbol sort key is the index in this list. A class that is not listed
   * sorts after every listed class. An empty list disables class ordering.
   */
  roadClassOrder: readonly string[];
  /**
   * Zoom levels that control {@link ShieldSchema.roadClassOrder}.
   *
   * This array must be the same length as `roadClassOrder` and strictly
   * increasing. Below the first zoom, only the first class is drawn. Each
   * zoom except the last reveals one additional class. The last zoom draws
   * every class, including classes that are not listed. An empty list, paired
   * with an empty `roadClassOrder`, draws every feature at every zoom.
   *
   * {@link OPENMAPTILES} uses `[8, 10, 11, 12, 14]` for motorway, trunk,
   * primary, secondary, and tertiary.
   */
  opacityZooms: readonly number[];
  /**
   * Replace the generated image-id expression for one route slot.
   * Set together with {@link ShieldSchema.parseImageName} and
   * {@link ShieldSchema.formatImageName}. Leave all three unset to encode
   * `imagePrefix`, then each attribute, separated by `attributeSeparator`.
   *
   * `routeIndex` is 1-based. The library still wraps this expression in
   * `image` and still decides whether the slot exists by testing
   * {@link ShieldSchema.propertyName}.
   */
  getImageName?: (routeIndex: number) => ExpressionSpecification;
  /**
   * Parse an image id produced by this schema back into a route.
   * Required when {@link ShieldSchema.getImageName} is set.
   */
  parseImageName?: (imageName: string) => RouteDefinition;
  /**
   * Write the image id for one route. Required when
   * {@link ShieldSchema.getImageName} is set. Attributes other than network,
   * ref, and name are written as empty when the default codec is used.
   */
  formatImageName?: (network: string, ref: string, name: string) => string;
  /**
   * Whether a missing-image id belongs to this schema.
   * Defaults to ids that start with `imagePrefix + attributeSeparator`.
   * Set this when a custom codec produces a different prefix.
   */
  acceptsImageId?: (imageId: string) => boolean;
}
/**
 * MapLibre's default symbol-layer font stack.
 *
 * Shield graphics are images, but MapLibre still requires `text-font` to
 * place formatted image sections. This is the style-spec default. A style
 * whose glyph stack does not include these fonts should pass its own
 * `textFont`.
 */
export declare const DEFAULT_SHIELD_TEXT_FONT: readonly string[];
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
export declare const OPENMAPTILES: ShieldSchema;
/**
 * Per-call replacements for values that live on the schema but are often
 * chosen by the style instead.
 */
export interface ShieldLayerOverrides {
  /** MapLibre source id. Defaults to {@link ShieldSchema.source}. */
  source?: string;
  /** Vector source-layer. Defaults to {@link ShieldSchema.sourceLayer}. */
  sourceLayer?: string;
  /** Symbol layer id. Defaults to {@link ShieldSchema.layerId}. */
  layerId?: string;
  /**
   * Font stack for the symbol layer. Defaults to
   * {@link DEFAULT_SHIELD_TEXT_FONT}.
   */
  textFont?: readonly string[];
  /**
   * Extra space between concurrent shields, in ems.
   * Defaults to `0.7`, so adjacent concurrent shields do not touch.
   */
  letterSpacing?: number;
}
/**
 * Options for {@link addShieldLayer}.
 * `schema` selects the tile encoding. `sprites` selects the artwork.
 */
export interface AddShieldLayerOptions extends ShieldLayerOverrides {
  /** Tile schema. Pass {@link OPENMAPTILES} for OpenMapTiles. */
  schema: ShieldSchema;
  /**
   * Shield artwork and network definitions.
   * A string or {@link URL} is fetched. A {@link ShieldSpecification} is used
   * directly. This is not part of the schema: the same OpenMapTiles schema can
   * draw any sprite set you supply.
   */
  sprites: string | URL | ShieldSpecification;
  /** Insert the new layer immediately before this layer id. */
  beforeId?: string;
  /**
   * Additional image-id test. The schema's own id test still applies, so this
   * can only narrow the set of ids the renderer claims.
   */
  filterImageID?: StringPredicate;
  /** Which route networks this renderer should draw. */
  filterNetwork?: StringPredicate;
}
/**
 * `text-field` expression for concurrent route shields.
 *
 * Styles that already have a shield layer assign the result to `text-field`.
 * The expression asks MapLibre for one missing image per populated route slot,
 * up to {@link ShieldSchema.maxConcurrency}. The image ids are the ones
 * {@link routeParserFromSchema} parses.
 *
 * For a layer that does not exist yet, use {@link getShieldLayer} or
 * {@link addShieldLayer} instead of assembling the rest of the layer yourself.
 */
export declare function getShieldExpression(
  schema: ShieldSchema
): ExpressionSpecification;
/**
 * Symbol layer for `schema`, including the image expression, the road-class
 * sort key, and the zoom opacity ramp.
 *
 * For {@link OPENMAPTILES}, this is the standard OpenMapTiles highway-shield
 * layer, aside from `text-font`. Pass `textFont` to match your style's glyph
 * stack. Spread the result into a style document. If the map already exists
 * and the style has no shield layer, {@link addShieldLayer} adds this layer
 * and installs the missing-image handler.
 */
export declare function getShieldLayer(
  schema: ShieldSchema,
  overrides?: ShieldLayerOverrides
): SymbolLayerSpecification;
/**
 * Parser and formatter for image ids produced by `schema`.
 *
 * Use this with {@link ShieldRenderer} or {@link URLShieldRenderer} when
 * installing the handler yourself. Pair it with {@link isSchemaShieldId} so
 * unrelated missing images remain available to other resolvers.
 */
export declare function routeParserFromSchema(
  schema: ShieldSchema
): RouteParser;
/**
 * Whether `imageId` is a shield id from `schema`.
 * This is the image-id filter {@link createShieldRenderer} installs.
 */
export declare function isSchemaShieldId(
  schema: ShieldSchema,
  imageId: string
): boolean;
/**
 * Renderer whose parser and image-id filter match `schema`.
 *
 * Call {@link AbstractShieldRenderer.renderOnMaplibreGL} to install it.
 * Use this when the style document already contains the shield layer.
 * {@link addShieldLayer} is the one-call version for a map whose style does
 * not have that layer yet.
 *
 * @example
 * ```ts
 * createShieldRenderer("shields.json", OPENMAPTILES).renderOnMaplibreGL(map);
 * ```
 */
export declare function createShieldRenderer(
  sprites: string | URL | ShieldSpecification,
  schema: ShieldSchema
): AbstractShieldRenderer;
/**
 * Add a shield layer for `schema` and install the missing-image handler.
 *
 * The handler is installed before the layer is added, so the first render can
 * resolve the images the new layer requests. The returned renderer is the
 * same object {@link createShieldRenderer} builds, and it is already attached
 * to `map`.
 *
 * Artwork stays in `options.sprites`. A different color scheme or drawing
 * style is a different sprite specification used with the same schema.
 *
 * @example
 * ```ts
 * addShieldLayer(map, {
 *   schema: OPENMAPTILES,
 *   sprites: "shields.json",
 *   source: "openmaptiles",
 *   textFont: ["Noto Sans Regular"],
 * });
 * ```
 */
export declare function addShieldLayer(
  map: MapLibre,
  options: AddShieldLayerOptions
): AbstractShieldRenderer;
