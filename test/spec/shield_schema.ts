"use strict";

import { expect } from "chai";
import type { Map as MapLibre } from "maplibre-gl";
import { HeadlessGraphicsFactory } from "../../src/headless_graphics";
import {
  DEFAULT_SHIELD_TEXT_FONT,
  InMemorySpriteRepository,
  OPENMAPTILES,
  addShieldLayer,
  createShieldRenderer,
  getShieldExpression,
  getShieldLayer,
  isSchemaShieldId,
  routeParserFromSchema,
} from "../../src/index";
import type { ShieldSchema, ShieldSpecification } from "../../src/index";

const interstateSpec = {
  options: {
    bannerHeight: 9,
    bannerPadding: 1,
    bannerTextColor: "#000",
    bannerTextHaloColor: "#fff",
    shieldFont: "sans-serif",
    shieldSize: 20,
  },
  networks: {
    "US:I": {
      textColor: "#fff",
      shapeBlank: {
        drawFunc: "roundedRectangle",
        params: {
          fillColor: "#00f",
          strokeColor: "#fff",
          rectWidth: 20,
          radius: 2,
        },
      },
      padding: { left: 2, right: 2, top: 2, bottom: 2 },
    },
  },
} as ShieldSpecification;

function simpleSchema(overrides: Partial<ShieldSchema> = {}): ShieldSchema {
  return {
    id: "simple",
    source: "roads",
    sourceLayer: "road",
    layerId: "shields",
    routeAttributes: ["network", "ref", "name"],
    maxConcurrency: 2,
    imagePrefix: "shield",
    attributeSeparator: "|",
    propertyName: (routeIndex, attribute) => `${attribute}_${routeIndex}`,
    roadClassProperty: "kind",
    roadClassOrder: ["highway", "street"],
    opacityZooms: [10, 14],
    ...overrides,
  };
}

describe("shield schema", function () {
  describe("OPENMAPTILES", function () {
    it("names the OpenMapTiles transportation_name route slots", function () {
      expect(OPENMAPTILES.id).to.equal("openmaptiles");
      expect(OPENMAPTILES.source).to.equal("openmaptiles");
      expect(OPENMAPTILES.sourceLayer).to.equal("transportation_name");
      expect(OPENMAPTILES.layerId).to.equal("highway-shield");
      expect(OPENMAPTILES.routeAttributes).to.eql([
        "network",
        "ref",
        "name",
        "color",
      ]);
      expect(OPENMAPTILES.maxConcurrency).to.equal(8);
      expect(OPENMAPTILES.imagePrefix).to.equal("shield");
      expect(OPENMAPTILES.attributeSeparator).to.equal("\n");
      expect(OPENMAPTILES.propertyName(1, "network")).to.equal(
        "route_1_network"
      );
      expect(OPENMAPTILES.propertyName(8, "color")).to.equal("route_8_color");
      expect(OPENMAPTILES.roadClassProperty).to.equal("class");
      expect(OPENMAPTILES.roadClassOrder).to.eql([
        "motorway",
        "trunk",
        "primary",
        "secondary",
        "tertiary",
      ]);
      expect(OPENMAPTILES.opacityZooms).to.eql([8, 10, 11, 12, 14]);
    });

    it("is frozen so callers cannot change the shared defaults", function () {
      expect(Object.isFrozen(OPENMAPTILES)).to.equal(true);
      expect(Object.isFrozen(OPENMAPTILES.routeAttributes)).to.equal(true);
      expect(Object.isFrozen(OPENMAPTILES.roadClassOrder)).to.equal(true);
      expect(Object.isFrozen(OPENMAPTILES.opacityZooms)).to.equal(true);
      expect(() => {
        (OPENMAPTILES as { source: string }).source = "elsewhere";
      }).to.throw(TypeError);
    });
  });

  describe("getShieldExpression", function () {
    it("builds one image per OpenMapTiles route slot", function () {
      const expression = getShieldExpression(OPENMAPTILES);
      const attributes = ["network", "ref", "name", "color"];

      expect(expression[0]).to.equal("format");
      expect(expression).to.have.length(9);
      for (let routeIndex = 1; routeIndex <= 8; routeIndex++) {
        expect(expression[routeIndex]).to.eql([
          "case",
          [
            "any",
            ...attributes.map((attribute) => [
              "has",
              `route_${routeIndex}_${attribute}`,
            ]),
          ],
          [
            "image",
            [
              "concat",
              "shield",
              ...attributes.flatMap((attribute) => [
                "\n",
                ["coalesce", ["get", `route_${routeIndex}_${attribute}`], ""],
              ]),
            ],
          ],
          ["literal", ""],
        ]);
      }
    });

    it("uses another schema's property names and concurrency", function () {
      const expression = getShieldExpression(simpleSchema());

      expect(expression).to.have.length(3);
      expect(expression[2]).to.eql([
        "case",
        ["any", ["has", "network_2"], ["has", "ref_2"], ["has", "name_2"]],
        [
          "image",
          [
            "concat",
            "shield",
            "|",
            ["coalesce", ["get", "network_2"], ""],
            "|",
            ["coalesce", ["get", "ref_2"], ""],
            "|",
            ["coalesce", ["get", "name_2"], ""],
          ],
        ],
        ["literal", ""],
      ]);
    });
  });

  describe("getShieldLayer", function () {
    it("builds the OpenMapTiles highway shield layer", function () {
      const layer = getShieldLayer(OPENMAPTILES, {
        textFont: ["Noto Sans Regular"],
      });

      expect(layer).to.eql({
        id: "highway-shield",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        layout: {
          "text-rotation-alignment": "viewport-glyph",
          "text-font": ["Noto Sans Regular"],
          "text-field": getShieldExpression(OPENMAPTILES),
          "text-anchor": "center",
          "text-letter-spacing": 0.7,
          "symbol-placement": "line",
          "text-max-angle": 180,
          "text-pitch-alignment": "viewport",
          "symbol-sort-key": [
            "match",
            ["get", "class"],
            "motorway",
            0,
            "trunk",
            1,
            "primary",
            2,
            "secondary",
            3,
            "tertiary",
            4,
            5,
          ],
        },
        paint: {
          "text-opacity": [
            "step",
            ["zoom"],
            ["match", ["get", "class"], "motorway", 1, 0],
            8,
            ["match", ["get", "class"], ["motorway", "trunk"], 1, 0],
            10,
            ["match", ["get", "class"], ["motorway", "trunk", "primary"], 1, 0],
            11,
            [
              "match",
              ["get", "class"],
              ["motorway", "trunk", "primary", "secondary"],
              1,
              0,
            ],
            12,
            [
              "match",
              ["get", "class"],
              ["motorway", "trunk", "primary", "secondary", "tertiary"],
              1,
              0,
            ],
            14,
            1,
          ],
        },
        filter: [
          "any",
          ["has", "route_1_network"],
          ["has", "route_1_ref"],
          ["has", "route_1_name"],
          ["has", "route_1_color"],
        ],
      });
    });

    it("lets the style replace source, layer id, font, and letter spacing", function () {
      const layer = getShieldLayer(OPENMAPTILES, {
        source: "omf",
        sourceLayer: "transportation_name",
        layerId: "route-shields",
        textFont: ["Noto Sans Regular"],
        letterSpacing: 0.2,
      });

      expect(layer.source).to.equal("omf");
      expect(layer["source-layer"]).to.equal("transportation_name");
      expect(layer.id).to.equal("route-shields");
      expect(layer.layout["text-font"]).to.eql(["Noto Sans Regular"]);
      expect(layer.layout["text-letter-spacing"]).to.equal(0.2);
      expect(layer.layout["text-field"]).to.eql(
        getShieldExpression(OPENMAPTILES)
      );
    });

    it("defaults the font to the MapLibre symbol-layer stack", function () {
      const layer = getShieldLayer(OPENMAPTILES);
      expect(layer.layout["text-font"]).to.eql(DEFAULT_SHIELD_TEXT_FONT);
      expect(DEFAULT_SHIELD_TEXT_FONT).to.eql([
        "Open Sans Regular",
        "Arial Unicode MS Regular",
      ]);
    });

    it("derives the opacity ramp from the schema's classes", function () {
      const layer = getShieldLayer(simpleSchema());
      expect(layer.layout["symbol-sort-key"]).to.eql([
        "match",
        ["get", "kind"],
        "highway",
        0,
        "street",
        1,
        2,
      ]);
      expect(layer.paint["text-opacity"]).to.eql([
        "step",
        ["zoom"],
        ["match", ["get", "kind"], "highway", 1, 0],
        10,
        ["match", ["get", "kind"], ["highway", "street"], 1, 0],
        14,
        1,
      ]);
    });

    it("shows a single class until its zoom, then everything", function () {
      const layer = getShieldLayer(
        simpleSchema({
          roadClassOrder: ["highway"],
          opacityZooms: [12],
        })
      );
      expect(layer.paint["text-opacity"]).to.eql([
        "step",
        ["zoom"],
        ["match", ["get", "kind"], "highway", 1, 0],
        12,
        1,
      ]);
    });

    it("draws every feature when the schema has no road classes", function () {
      const layer = getShieldLayer(
        simpleSchema({
          roadClassOrder: [],
          opacityZooms: [],
        })
      );
      expect(layer.layout["symbol-sort-key"]).to.eql(["literal", 0]);
      expect(layer.paint["text-opacity"]).to.eql(["literal", 1]);
    });
  });

  describe("route parser", function () {
    const parser = routeParserFromSchema(OPENMAPTILES);

    it("parses an OpenMapTiles image id", function () {
      expect(parser.parse("shield\nUS:I\n95\n\n")).to.eql({
        network: "US:I",
        ref: "95",
      });
      expect(parser.parse("shield\nUS:I\n95\nLincoln Highway\nred")).to.eql({
        network: "US:I",
        ref: "95",
        name: "Lincoln Highway",
      });
    });

    it("keeps color in the id without treating it as shield text", function () {
      const blue = "shield\nUS:I\n95\n\nblue";
      const red = "shield\nUS:I\n95\n\nred";
      expect(parser.parse(blue)).to.eql(parser.parse(red));
      expect(blue).to.not.equal(red);
    });

    it("round-trips network, ref, and name", function () {
      expect(
        parser.parse(parser.format("US:I", "95", "Lincoln Highway"))
      ).to.eql({
        network: "US:I",
        ref: "95",
        name: "Lincoln Highway",
      });
      expect(parser.format("US:I", "95", "")).to.equal("shield\nUS:I\n95\n\n");
      expect(parser.parse(parser.format("US:I", "", ""))).to.eql({
        network: "US:I",
      });
    });

    it("rejects ids from a different encoding", function () {
      expect(() => parser.parse("shield|US:I=95")).to.throw(
        /not a openmaptiles shield id/
      );
    });

    it("accepts only ids with this schema's prefix and separator", function () {
      expect(isSchemaShieldId(OPENMAPTILES, "shield\nUS:I\n95\n\n")).to.equal(
        true
      );
      expect(isSchemaShieldId(OPENMAPTILES, "shield")).to.equal(false);
      expect(isSchemaShieldId(OPENMAPTILES, "shield|US:I=95")).to.equal(false);
      expect(isSchemaShieldId(simpleSchema(), "shield|US:I|95|")).to.equal(
        true
      );
      expect(isSchemaShieldId(simpleSchema(), "shield\nUS:I\n95\n\n")).to.equal(
        false
      );
    });

    it("round-trips a schema that uses a different separator", function () {
      const parser = routeParserFromSchema(simpleSchema());
      expect(parser.format("CA:ON:primary", "401", "")).to.equal(
        "shield|CA:ON:primary|401|"
      );
      expect(parser.parse("shield|CA:ON:primary|401|")).to.eql({
        network: "CA:ON:primary",
        ref: "401",
      });
    });
  });

  describe("custom image codec", function () {
    const custom = simpleSchema({
      id: "custom",
      maxConcurrency: 1,
      routeAttributes: ["network", "ref"],
      getImageName: (routeIndex) => [
        "concat",
        "rte:",
        ["get", `network${routeIndex}`],
        "=",
        ["coalesce", ["get", `ref${routeIndex}`], ""],
      ],
      parseImageName: (imageId) => {
        const [network, ref] = imageId.slice("rte:".length).split("=");
        return ref ? { network, ref } : { network };
      },
      formatImageName: (network, ref) => `rte:${network}=${ref ?? ""}`,
      acceptsImageId: (imageId) => imageId.startsWith("rte:"),
    });

    it("uses the supplied expression and still tests the schema properties", function () {
      expect(getShieldExpression(custom)[1]).to.eql([
        "case",
        ["any", ["has", "network_1"], ["has", "ref_1"]],
        [
          "image",
          [
            "concat",
            "rte:",
            ["get", "network1"],
            "=",
            ["coalesce", ["get", "ref1"], ""],
          ],
        ],
        ["literal", ""],
      ]);
    });

    it("parses and accepts the custom id spelling", function () {
      const parser = routeParserFromSchema(custom);
      expect(parser.format("US:I", "95", "")).to.equal("rte:US:I=95");
      expect(parser.parse("rte:US:I=95")).to.eql({
        network: "US:I",
        ref: "95",
      });
      expect(isSchemaShieldId(custom, "rte:US:I=95")).to.equal(true);
      expect(isSchemaShieldId(custom, "shield|US:I|95|")).to.equal(false);
    });
  });

  describe("validation", function () {
    it("rejects a partial custom codec", function () {
      expect(() =>
        getShieldExpression(
          simpleSchema({
            getImageName: () => ["concat", "shield"],
          })
        )
      ).to.throw(/must be set together/);
    });

    it("rejects opacity zooms that do not match the class list", function () {
      expect(() =>
        getShieldExpression(
          simpleSchema({
            opacityZooms: [8],
          })
        )
      ).to.throw(/opacityZooms length/);
    });

    it("rejects opacity zooms that go backwards", function () {
      expect(() =>
        getShieldExpression(
          simpleSchema({
            opacityZooms: [12, 10],
          })
        )
      ).to.throw(/strictly increasing/);
    });

    it("rejects a default codec that has no network attribute", function () {
      expect(() =>
        getShieldExpression(
          simpleSchema({
            routeAttributes: ["ref", "name"],
          })
        )
      ).to.throw(/network/);
    });

    it("rejects a concurrency below 1", function () {
      expect(() =>
        getShieldLayer(
          simpleSchema({
            maxConcurrency: 0,
          })
        )
      ).to.throw(/maxConcurrency/);
    });
  });

  describe("createShieldRenderer", function () {
    it("draws an OpenMapTiles id and ignores other missing images", function () {
      const repo = new InMemorySpriteRepository();
      const renderer = createShieldRenderer(interstateSpec, OPENMAPTILES)
        .graphicsFactory(new HeadlessGraphicsFactory())
        .renderOnRepository(repo);
      const resolver = renderer.getMissingStyleImageResolver();
      const imageId = "shield\nUS:I\n95\n\n";

      resolver("park-icon");
      expect(repo.hasSprite("park-icon")).to.equal(false);

      resolver(imageId);
      expect(repo.hasSprite(imageId)).to.equal(true);
      expect(repo.getSprite(imageId).width).to.be.greaterThan(1);
    });

    it("stores an empty sprite when the network filter declines the route", function () {
      const repo = new InMemorySpriteRepository();
      const imageId = "shield\nUS:I\n95\n\n";
      createShieldRenderer(interstateSpec, OPENMAPTILES)
        .filterNetwork((network) => network !== "US:I")
        .graphicsFactory(new HeadlessGraphicsFactory())
        .renderOnRepository(repo)
        .getMissingStyleImageResolver()(imageId);

      expect(repo.getSprite(imageId).width).to.equal(1);
      expect(repo.getSprite(imageId).height).to.equal(1);
    });
  });

  describe("addShieldLayer", function () {
    let restoreDocument: () => void;

    beforeEach(function () {
      const previous = globalThis.document;
      (globalThis as { document?: unknown }).document = {
        fonts: {
          check: () => true,
          load: () => Promise.resolve([]),
        },
      };
      restoreDocument = () => {
        if (previous === undefined) {
          delete (globalThis as { document?: unknown }).document;
        } else {
          globalThis.document = previous;
        }
      };
    });

    afterEach(function () {
      restoreDocument();
    });

    function fakeMap() {
      const calls: {
        order: string[];
        layer?: unknown;
        beforeId?: string;
        resolver?: (imageId: string) => void;
        added: string[];
      } = { order: [], added: [] };
      const map = {
        addLayer(layer: unknown, beforeId?: string) {
          calls.order.push("addLayer");
          calls.layer = layer;
          calls.beforeId = beforeId;
        },
        setMissingStyleImageResolver(resolver: (imageId: string) => void) {
          calls.order.push("resolver");
          calls.resolver = resolver;
        },
        redraw() {},
        listImages() {
          return [];
        },
        addImage(id: string) {
          calls.added.push(id);
        },
        removeImage() {},
        style: {
          getImage() {
            return undefined;
          },
        },
      };
      return { map: map as unknown as MapLibre, calls };
    }

    it("installs the handler before adding the OpenMapTiles layer", function () {
      const { map, calls } = fakeMap();
      addShieldLayer(map, {
        schema: OPENMAPTILES,
        sprites: interstateSpec,
        textFont: ["Noto Sans Regular"],
        source: "omf",
        beforeId: "road-label",
      });

      expect(calls.order).to.eql(["resolver", "addLayer"]);
      expect(calls.beforeId).to.equal("road-label");
      expect(calls.layer).to.eql(
        getShieldLayer(OPENMAPTILES, {
          textFont: ["Noto Sans Regular"],
          source: "omf",
        })
      );
      expect(calls.resolver).to.be.a("function");

      calls.resolver("park-icon");
      expect(calls.added).to.eql([]);
    });

    it("does not claim an id the extra image filter rejects", function () {
      const { map, calls } = fakeMap();
      addShieldLayer(map, {
        schema: OPENMAPTILES,
        sprites: interstateSpec,
        filterImageID: () => false,
      });

      calls.resolver("shield\nUS:I\n95\n\n");
      expect(calls.added).to.eql([]);
    });

    it("loads a sprite URL with the schema parser", async function () {
      const { map } = fakeMap();
      const originalFetch = globalThis.fetch;
      let requested: string | undefined;
      globalThis.fetch = (async (url: string) => {
        requested = url;
        return {
          json: async () => interstateSpec,
        };
      }) as typeof fetch;

      try {
        addShieldLayer(map, {
          schema: OPENMAPTILES,
          sprites: "https://example.test/shields.json",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(requested).to.equal("https://example.test/shields.json");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
