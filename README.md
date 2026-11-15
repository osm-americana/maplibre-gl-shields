# MapLibre Highway Shields

A plugin for [MapLibre GL&nbsp;JS](https://github.com/maplibre/maplibre-gl-js/) that draws graphical highway route shields on the map.

![Pictorial highway shields](https://wiki.openstreetmap.org/w/images/6/6d/Rendered_shields_americana.png)

## Requirements

Compatible with MapLibre GL&nbsp;JS v6.0.0 and above.

## Installation

This plugin is available as [an NPM package](https://www.npmjs.com/package/@americana/maplibre-shield-generator). To install it, run the following command:

```sh
npm install @americana/maplibre-shield-generator
```

Alternatively, you can include the plugin as a standalone script from a CDN such as [unpkg](https://unpkg.com/@americana/maplibre-shield-generator/dist/index.js).

For Node scripts and tests that need to draw shields without a browser, install [`canvas`](https://www.npmjs.com/package/canvas) and import the headless entry:

```ts
import { HeadlessGraphicsFactory } from "@americana/maplibre-shield-generator/headless";
```

## Usage

A shield layer has two independent pieces:

- A **schema** describes how route attributes are stored in the vector tiles and how those attributes become missing-image ids. [`OPENMAPTILES`](src/shield_schema.ts) is that description for the OpenMapTiles `transportation_name` layer. Pass a different object of the same shape for another tile schema.
- A **sprite specification** describes the artwork: which graphic, padding, and text treatment to draw for each network. Host your own JSON and sprites, or reuse a published specification. A different color scheme is a different sprite specification, used with the same schema.

The font stack is a third, smaller choice. Shield graphics are images, but MapLibre still needs `text-font` to place them. Pass the fonts your style actually loads.

### Add shields to an OpenMapTiles map

`addShieldLayer` installs a missing-image handler and adds the shield layer. The handler is installed first, so the layer's first render can resolve images.

```typescript
import {
  OPENMAPTILES,
  addShieldLayer,
} from "@americana/maplibre-shield-generator";

addShieldLayer(map, {
  schema: OPENMAPTILES,
  sprites: "shields.json",
  textFont: ["Noto Sans Regular"],
});
```

`OPENMAPTILES` supplies the OpenMapTiles defaults: source `openmaptiles`, source-layer `transportation_name`, properties `route_1_network` through `route_8_color`, and image ids shaped like `shield\nUS:I\n95\n\n`. It also supplies the road-class sort order and the zoom opacity ramp (motorway from the start, then trunk, primary, secondary, and tertiary, then every other class at zoom 14).

Override the source id when the style names its OpenMapTiles source something else. `beforeId` inserts the layer at a chosen position.

```typescript
addShieldLayer(map, {
  schema: OPENMAPTILES,
  sprites: "shields.json",
  source: "omf",
  textFont: ["Noto Sans Regular"],
  beforeId: "road-label",
});
```

`sprites` may be a URL or a shield specification object built in code. Pass `filterNetwork` in the options so it is installed before the first render. The function returns the renderer, already attached to the map. Call `onShieldDefLoad` on that return value to observe the loaded network definitions:

```typescript
const renderer = addShieldLayer(map, {
  schema: OPENMAPTILES,
  sprites: shields,
  textFont: ["Noto Sans Regular"],
  // Skip recreational route networks (nwn, lwn, rcn, and so on).
  filterNetwork: (network) => !/^[lrni][chimpw]n$/.test(network),
});

renderer.onShieldDefLoad((networks) => {
  // `networks` is the shield specification after it loads.
});
```

### The style already has a shield layer

If the style document already includes a shield layer, install only the missing-image handler once the map exists. `addShieldLayer` would add a second layer.

`getShieldLayer` returns the whole symbol layer. `getShieldExpression` returns only the `text-field`, for a layer whose other layout properties you already own. `createShieldRenderer` installs the missing-image handler without adding a layer.

```typescript
import {
  OPENMAPTILES,
  createShieldRenderer,
  getShieldExpression,
  getShieldLayer,
} from "@americana/maplibre-shield-generator";

// While assembling the style:
style.layers.push(
  getShieldLayer(OPENMAPTILES, { textFont: ["Noto Sans Regular"] })
);

// Or, inside a layer that already exists:
layout["text-field"] = getShieldExpression(OPENMAPTILES);

// Once the map exists:
createShieldRenderer("shields.json", OPENMAPTILES).renderOnMaplibreGL(map);
```

For OpenMapTiles, the image id for Interstate 95 is `shield`, then `US:I`, `95`, an empty name, and an empty color, separated by newlines. A named route fills in the name. The color attribute stays in the id so two colors do not share one sprite; the current renderer paints from network, ref, and name.

### Another tile schema

Define an object with the same fields and pass it wherever `OPENMAPTILES` is passed. Property names, the image-id spelling, and the opacity ramp all come from that object.

```typescript
import {
  addShieldLayer,
  type ShieldSchema,
} from "@americana/maplibre-shield-generator";

const MY_SCHEMA: ShieldSchema = {
  id: "my-tiles",
  source: "roads",
  sourceLayer: "road",
  layerId: "highway-shield",
  routeAttributes: ["network", "ref", "name"],
  maxConcurrency: 2,
  imagePrefix: "shield",
  attributeSeparator: "|",
  propertyName: (routeIndex, attribute) => `${attribute}_${routeIndex}`,
  roadClassProperty: "kind",
  roadClassOrder: ["highway", "street"],
  // Below zoom 10, only highway. At 10, highway and street. At 14, every class.
  opacityZooms: [10, 14],
};

addShieldLayer(map, {
  schema: MY_SCHEMA,
  sprites: myShields,
  textFont: ["Noto Sans Regular"],
});
```

That schema reads `network_1`, `ref_1`, and `name_1`, and it produces image ids such as `shield|US:I|95|`. `opacityZooms` must be the same length as `roadClassOrder` and strictly increasing.

If the image id is not `prefix + separator + attributes`, set `getImageName`, `parseImageName`, and `formatImageName` together, and set `acceptsImageId` when the prefix differs. Those three hooks replace only the spelling of the id. The schema's `propertyName` is still how the layer decides that a route slot exists.

### Manual setup

The schema helpers above are the supported way to connect tiles to the renderer. The steps below are the lower-level pieces those helpers assemble, for a caller that wants to own the expression and the parser directly.

Rendering shields requires the following components:

1. **Encode shield information in vector tiles**. First, your tiles must contain the information which tells the shield renderer what shields to draw. In OpenMapTiles, shield information is encoded in the [`transportation_name`](https://openmaptiles.org/schema/#transportation_name) vector tile layer with a series of attributes named `route_1`, `route_2`, etc. Each attribute contains a text string which contains all of the information needed to determine which graphic to display, including numeric route number if the shield is numbered. However, this library allows you to specify how the shield information has been encoded, and it's possible to stitch together data from multiple fields when encoding shield data.

2. **Expose shield information in a style layer**. Next, route information must be exposed in a maplibre expression using [image](https://maplibre.org/maplibre-gl-js-docs/style-spec/expressions/#types-image) in a structured string containing the route information. For example, you might encode Interstate 95 as an image named `shield|US:I=95`. Normally, the image expression is used to point to pre-designated sprites in a sprite sheet, but in this case, we're pointing to a sprite which doesn't exist called `shield|US:I=95`. MapLibre asks the map's [missing style image resolver](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#setmissingstyleimageresolver) for that ID, and the shield renderer generates the graphic just in time. For the OpenMapTiles encoding, use `getShieldLayer(OPENMAPTILES)` instead of assembling that layer by hand.

3. **Define a parser that describes how route information is encoded**. There are three parts to a route definition:

   1. The `network` string, which defines a network with a common shield shape, graphic, and color
   1. The `ref` string, which defines a text sequence that should be drawn on top of the shield graphic
   1. The `name` string, which defines a name, separate from the ref, that is used to determine which graphic to draw

   `routeParserFromSchema(schema)` returns the parser and formatter for a schema object, and `isSchemaShieldId(schema, imageId)` is the image-id predicate that matches those ids. A hand-written parser looks like this:

   ```typescript
   let routeParser = {
     //format is `shield|${network}=${ref}|${name}`
     parse: (id: string) => {
       let id_parts = id.split("|");
       let network_ref = id_parts[1].split("=");

       return {
         network: network_ref[0],
         ref: network_ref[1],
         name: id_parts[2],
       };
     },
     format: (network: string, ref: string, name: string) =>
       `shield|${network}=${ref}|${name}`,
   };
   ```

4. **(Optional) Create predicates that define which shields will be handled**. For example, if all sprite IDs in your style that need a shield begin with the string `shield|`, this would look like:

   ```typescript
   let shieldPredicate = (imageID: string) => imageID.startsWith("shield");
   ```

   This step can be skipped if all unhandled image IDs are shields.

   Additionally, you can specify which networks will be handled. The example below ignores all `nwn`, `lwn`, `ncn`, etc. network values:

   ```typescript
   let networkPredicate = (network: string) =>
     !/^[lrni][chimpw]n$/.test(network);
   ```

5. **Create shield definitions and artwork**. The shield definition is expressed as a JSON file along with a set of sprites containing any raster artwork used for the shields. It can be generated as an object or hosted as a JSON file accessible by URL. See the next section for how to create this definition.

6. **Hook up the shield generator to a maplibre-gl-js map**. `addShieldLayer` and `createShieldRenderer` do this for a schema object. To wire it yourself, pass either the URL of the JSON shield definition or an object built in code. There are two separate classes for each approach.

   ```typescript
   new URLShieldRenderer("shields.json", routeParser)
     .filterImageID(shieldPredicate)
     .filterNetwork(networkPredicate)
     .renderOnMaplibreGL(map);
   ```

   ```typescript
   new ShieldRenderer(shields, routeParser)
     .filterImageID(shieldPredicate)
     .filterNetwork(networkPredicate)
     .renderOnMaplibreGL(map);
   ```

## Shield definition

The purpose of the shield definition is to define which graphics and text to draw for each network/ref/name combination that you wish to display. This can be created in JavaScript as an object, or as an HTTP-accessible JSON file.

This description uses the following conventions:

- A **network** is a set of routes with a _common graphical presentation_. Each route may have variations in appearance, such as a different route number, or a special case definition as described below. The network value corresponds in concept to the OpenStreetMap [network tag](https://wiki.openstreetmap.org/wiki/Key:network).
- A **ref** contains the text to be drawn on shield artwork. The ref value corresponds in concept to the OpenStreetMap [ref tag](https://wiki.openstreetmap.org/wiki/Key:ref).

The structure is as follows:

```json
{
    "options": {
      "bannerHeight": 9,
      "bannerPadding": 1,
      "bannerTextColor": "black",
      "bannerTextHaloColor": "white",
      "shieldFont": "'Noto Sans Condensed', sans-serif-condensed, 'Arial Narrow', sans-serif",
      "shieldSize": 20
    },
    "default": { ...definition },
    "network_1": { ...definition },
    "network_2": { ...definition },
    "network_3": { ...definition }
}

```

The options block contains global parameters that apply across all shield drawing:

- **`bannerHeight`**: height of each text banner
- **`bannerPadding`**: padding between each banner
- **`bannerTextColor`**: color to draw text banners above the shield
- **`bannerTextHaloColor`**: color to draw an outline around the text banner
- **`shieldFont`**: ordered list of fonts to use for shield text and banners. Condensed sans-serif stacks such as Noto Sans Condensed work well for fitting route numbers into narrow shields.
- **`shieldSize`**: "standard" size to use for shields in 1x pixels. However, some shields may diverge, for example, drawn diamond shields are drawn slightly larger for visual similarity with squares.

You should create one definition entry for each network. The entry key must match the encoded `network` value exactly. The "default" network defines what should be drawn if there's no definition for a particular network. A network definiton can contain any combination of the following parameters:

```json
{
  "textColor": "black",
  "textHaloColor": "white",
  "padding": {
    "left": 3,
    "right": 3,
    "top": 3,
    "bottom": 3
  },
  "spriteBlank": ["name_of_image_2", "name_of_image_3", "name_of_image_4"],
  "noref": {
    "spriteBlank": "name_of_image_noref"
  }
  "shapeBlank": {
    "drawFunc": "pentagon",
    "params": {
      "pointUp": false,
      "yOffset": 5,
      "sideAngle": 0,
      "fillColor": "white",
      "strokeColor": "black",
      "radius1": 2,
      "radius2": 2
    }
  },
  "banners": ["ALT"],
  "bannerMap": {
    "ThisNetwork:Truck": ["TRK"],
    "ThisNetwork:Truck:Bypass": ["TRK", "BYP"]
  },
  "bannerTextColor": "#000",
  "bannerTextHaloColor": "#FFF",
  "textLayout": {
    "constraintFunc": "roundedRect",
    "options": {
      "radius": 2
    }
  },
  "colorLighten": "#006747",
  "overrideByRef": {
    "REF": {
      "spriteBlank": "special_case_image",
      "textColor": "#003f87",
      "colorLighten": "#003f87"
    }
  },
  "refsByName": {
    "Audubon Parkway": "AU"
  },
  "overrideByName": {
    "Merritt Parkway": {
      "spriteBlank": "shield_us_ct_parkway_merritt"
    }
  }
}
```

### Shield property descriptions

- **`textColor`**: determines what color to draw the `ref` on the shield.
- **`textHaloColor`**: color to draw a knockout halo around the `ref` text.
- **`padding`**: padding around the `ref`, which allows you to squeeze the text into a smaller space within the shield.
- **`spriteBlank`**: specify the name of an image in the sprite sheet to use as the shield background. This can either be a single string or an array of strings if there are multiple options for different width.
  - If `spriteBlank` is an array of strings, they must be ordered from narrowest to widest, and the filenames must be suffixed with a consecutive range of integers, representing the optimal number of characters to display in each icon.
- **`noref`**: specify alternate attributes to apply in the event that no `ref` is supplied. This allows you to use one graphic for numbered routes and a separate unitary graphic for non-numbered routes within the same network. Supports **`spriteBlank`**, **`colorLighten`**, and **`colorDarken`**.
- **`shapeBlank`**: specify that a shield should be drawn as a common shape (rectangle, ellipse, pentagon, etc), with colors and dimensions as specified. See the [drawn shield shapes](#defining-drawn-shield-shapes) section for available drawing options.
- **`banners`**: specify that one or more short text strings (up to 4 characters) should be drawn above the shield. This is specified as an array, and text will be drawn in order from top to bottom. Below is an example of bannered shields with up to three banners:

![Bannered routes near Downington, PA](https://wiki.openstreetmap.org/w/images/f/f8/Downington_bannered_routes_Americana.png)

- **`bannerMap`**: a map of network-to-banner arrays listing networks that should have the same style but with specified banners.
- **`bannerTextColor`**: specify the color of the banner text.
- **`bannerTextHaloColor`**: specify the color of the banner knockout halo.
- **`textLayout`**: specify how text should be inscribed within the padded bounds of the shield. The text will be drawn at the maximum size allowed by this constraint. See the [text layout functions](#text-layout-functions) section for text layout options.
- **`colorLighten`**: specify that the shield artwork should be lightened (multiplied) by the specified color. This means that black areas will be recolor with this color and white areas will remain the same. Alpha values will remain unmodified.
- **`colorDarken`**: specify that the shield artwork should be darkened by the specified color. This means that white areas will be recolor with this color and black areas will remain the same. Alpha values will remain unmodified.
- **`overrideByRef`**: specify that a specific `ref` within a `network` should have different shield properties than other routes in the network, with one entry per special-case `ref`. Supported options are **`spriteBlank`**, **`textColor`**, and **`colorLighten`**.
- **`refsByName`**: specify that a `name` with the specified key should be treated as a `ref` with the specified value.
- **`ref`**: specify that all shields in this network should be drawn with the specified `ref` value.
- **`overrideByName`**: specify that particular `name` should use a specific **`spriteBlank`** which differs from the rest of the network.

### Handling special case networks

The shield specification allows for the handling of special cases. For example, the [Kentucky Parkway System](https://en.wikipedia.org/wiki/List_of_parkways_and_named_highways_in_Kentucky) has distinctive named routes. The real-world shields look something like this:

![Western Kentucky Parkway shield](https://upload.wikimedia.org/wikipedia/en/d/db/Western_Kentucky_Parkway_fair_use.svg)

A map style might instead draw two-letter codes for each parkway:

![Kentucky parkways](https://wiki.openstreetmap.org/w/images/d/da/Kentucky_parkway_Americana.png)

Those codes are not the signed route numbers, so they do not belong in OpenStreetMap's `ref=*` tag. Use `refsByName` to map each parkway name to the code drawn on the shield:

```json
  "US:KY:Parkway": {
    "spriteBlank":"shield_us_ky_parkway",
    "textColor":"#003f87",
    "padding": {
      "left":2,
      "right":2,
      "top":2,
      "bottom":6
    },
    "refsByName": {
      "Audubon Parkway":"AU",
      "Bluegrass Parkway":"BG",
      "Bluegrass Pkwy":"BG",
      "Cumberland Parkway":"LN",
      "Cumberland Pkwy":"LN",
      "Hal Rogers Parkway":"HR",
      "Hal Rogers Pkwy":"HR",
      "Mountain Parkway":"MP",
      "Mountain Pkwy":"MP",
      "Purchase Parkway":"JC",
      "Purchase Pkwy":"JC",
      "Western Kentucky Parkway":"WK",
      "Western Kentucky Pkwy":"WK"
    }
  },

```

Another special case is when select routes within a network need to be styled differently. For example, [Georgia State Route 520](https://en.wikipedia.org/wiki/Georgia_State_Route_520) is signed with a green-colored shield, while the default color for Georgia state highways is black. The shield assembly below shows an intersection and concurrency with both styles of Georgia state route:

![Georgia Route 520](https://upload.wikimedia.org/wikipedia/commons/4/4f/GA_green_route_concurrency.png)

This effect can be achieved by overriding the text and sprite color in the route definition as follows. For multiple special case refs, add multiple entries.

```json
"US:GA": {
  "spriteBlank": ["shield_us_ga_2", "shield_us_ga_3"],
  "textColor": "black",
  "overrideByRef": {
    "520": {
      "textColor": "#006747",
      "colorLighten": "#006747"
    }
  }
}
```

In this example, the two `shield_us_ga_...` sprite blanks represent the narrow and wide versions of the Georgia state route shield, and are colored black with white fill. This results in the following:

![Georgia State Route 520 Concurrency](https://wiki.openstreetmap.org/w/images/0/0b/Columbs_georgia_concurrency.png)

Finally, the last special case is when one _named_ route in a network requires a different shield from other routes in the network. For example, the Merritt Parkway in Connecticut is tagged in OSM as `network=US:CT:Parkway` + `name=Merritt Parkway`. There are also two additional parkways in Connecticut tagged the same way. However, only the Merritt Parkway has a shield. Thus, we can define the `US:CT:Parkway` as an empty definition with an exception for a route named `Merritt Parkway`:

```json
"US:CT:Parkway": {
  "overrideByName" : {
    "Merritt Parkway": {
      "spriteBlank": "shield_us_ct_parkway_merritt",
    },
  }
}
```

The clip below shows the result where the Merritt Parkway (concurrent with CT-15) ends and the Wilbur Cross Parkway (name but no shield) begins:

![Merritt Parkway Shield](https://wiki.openstreetmap.org/w/images/3/37/Ct_parkway_shield.png)

### Text layout functions

Text is laid out on shields in accordance with the specified `textLayout` value. The text will be drawn, measured, and expanded until it hits the edge of a text layout constraint. For example, an `ellipse` constraint would fill a padded shield like this, with the text drawn from the center and expanding until it reaches the ellipse:

![Ellipse constraint](https://upload.wikimedia.org/wikipedia/commons/7/72/Ellipse_constraint.png)

Not all constraints are center-specified. For example, the `southHalfEllipse` constraint would grow from the top of the shield as follows:

![South half-ellipse constraint](https://upload.wikimedia.org/wikipedia/commons/6/62/South_half-ellipse_constraint.png)

The supported text constraints are:

- `diamond`
- `ellipse`
- `rect`
- `roundedRect`
- `southHalfEllipse`
- `triangleDown`

### Defining drawn shield shapes

If `shapeBlank` is specified, the shield will be drawn as a shape. This needs to be specified with a drawing function, `drawFunc` and a `params` block the describes how the shape will be drawn. The draw functions are as follows:

|                                                                                                                                                                                                                                                    | `drawFunc`          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| ![](https://upload.wikimedia.org/wikipedia/commons/c/cf/Diamond_highway_shield_shape.svg)                                                                                                                                                          | `diamond`           |
| ![](https://upload.wikimedia.org/wikipedia/commons/3/30/Black_and_white_circle_shape_as_used_in_highway_shields.svg)                                                                                                                               | `ellipse`           |
| ![](https://upload.wikimedia.org/wikipedia/commons/7/75/Escutcheon_highway_shield_shape.svg)                                                                                                                                                       | `escutcheon`        |
| ![](https://upload.wikimedia.org/wikipedia/commons/f/f8/Fishhead_highway_shield_shape.svg)                                                                                                                                                         | `fishhead`          |
| ![](https://upload.wikimedia.org/wikipedia/commons/6/61/Hexagon_highway_shield_shape.svg)                                                                                                                                                          | `hexagonVertical`   |
| ![](https://upload.wikimedia.org/wikipedia/commons/2/25/Horizontal_hexagon_shape.svg)                                                                                                                                                              | `hexagonHorizontal` |
| ![](https://upload.wikimedia.org/wikipedia/commons/f/f8/Octagon_shield_shape.svg)                                                                                                                                                                  | `octagonVertical`   |
| ![](https://upload.wikimedia.org/wikipedia/commons/f/ff/Pentagon_shield_shape.svg)![](https://upload.wikimedia.org/wikipedia/commons/b/b0/Black_and_white_home_plate_shape_as_used_in_highway_shields.svg)                                         | `pentagon`          |
| ![](https://upload.wikimedia.org/wikipedia/commons/archive/1/17/20230326013156%21Pill_shape.svg)                                                                                                                                                   | `pill`              |
| ![](https://upload.wikimedia.org/wikipedia/commons/3/30/Black_and_white_circle_shape_as_used_in_highway_shields.svg)![](https://upload.wikimedia.org/wikipedia/commons/archive/a/a1/20230326013519%21Rounded_rectangle_shape.svg)                  | `roundedRectangle`  |
| ![](https://upload.wikimedia.org/wikipedia/commons/a/ad/Black_and_white_downward_trapezoid_as_used_in_highway_shields.svg)![](https://upload.wikimedia.org/wikipedia/commons/5/56/Black_and_white_upward_trapezoid_as_used_in_highway_shields.svg) | `trapezoid`         |
| ![](https://upload.wikimedia.org/wikipedia/commons/a/ad/Downward_triangle_highway_shield_shape.svg)                                                                                                                                                | `triangle`          |

The following `params` options can be specified:

- `sideAngle` - indicates angle (in degrees) at which side edges deviate from vertical. Applies to `trapezoid`, `pentagon`, `hexagonHorizontal`, `octagonVertical`.
- `fill` - specifies the internal fill color.
- `yOffset` - indicates height (in pixels) at which the bottom and/or top edges deviate from horizontal. Applies to `escutcheon`, `pentagon`, `hexagonVertical`, `octagonVertical`.
- `outline` - specifies the outline color.
- `outlineWidth` - specifies the width of the outline.
- `pointUp` - applies to several shape types and specifies whether the pointy side is up.
- `radius` - specifies the rounding radius, in pixels, to use for corners.
- `radius1` - Corner radius of pointed side of pentagon (defaults to 2)
- `radius2` - Corner radius of flat side of pentagon (defaults to 0)
- `shortSideUp` - for `trapezoid` only, a boolean which specifies whether the short side is up or down.

### Custom shield graphics

In addition to the stock drawing functions, a custom draw function can be specified. `paDot` and `branson` are included as examples of this, for rendering the [Allegheny County belt system](https://en.wikipedia.org/wiki/Allegheny_County_belt_system) and the Branson, Missouri colored route system. See the file `src/custom_shields.mjs` for an example of how this is done.

## Development

### Tests

Install dependencies, then run the Mocha suite:

```sh
npm ci
npm test
```

Headless shield rendering tests use [`canvas`](https://www.npmjs.com/package/canvas). On Linux you may need the usual Cairo/Pango system packages before `npm ci` succeeds.

### Test coverage

Coverage is collected with [c8](https://github.com/bcoe/c8) over the TypeScript sources under `src/`.

```sh
npm run test:coverage
```

This prints a summary in the terminal and writes a full HTML report to `coverage/`. Open the report locally:

```sh
open coverage/index.html   # macOS
xdg-open coverage/index.html   # Linux
```

The `coverage/` directory is gitignored. On pull requests, CI also:

- posts the coverage summary on the Actions job summary page (visible from the Checks tab)
- uploads the HTML report as a `coverage-report` workflow artifact

## Documentation

See [TypeDoc generated documentation](https://osm-americana.github.io/maplibre-gl-shields/) for detailed API information.
