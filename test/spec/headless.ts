"use strict";

import { expect } from "chai";
import { ShieldRenderer, InMemorySpriteRepository } from "../../src/index";
import { HeadlessGraphicsFactory } from "../../src/headless_graphics";

describe("headless", function () {
  describe("HeadlessGraphicsFactory", function () {
    it("creates a drawing context with the requested size", function () {
      const gfx = new HeadlessGraphicsFactory();
      const ctx = gfx.createGraphics({ width: 40, height: 20 });

      expect(gfx.pixelRatio()).to.equal(1);
      expect(ctx.canvas.width).to.equal(40);
      expect(ctx.canvas.height).to.equal(20);
    });

    it("can render a shield into an in-memory sprite repository", function () {
      const shields = {
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
            padding: {
              left: 2,
              right: 2,
              top: 2,
              bottom: 2,
            },
          },
        },
      };

      const repo = new InMemorySpriteRepository();
      const routeParser = {
        parse: (id: string) => {
          const [, network, ref, name] = id.split("\n");
          return { network, ref, name };
        },
        format: (network: string, ref: string, name: string) =>
          `shield\n${network}\n${ref}\n${name}\n`,
      };

      const renderer = new ShieldRenderer(shields as any, routeParser)
        .graphicsFactory(new HeadlessGraphicsFactory())
        .renderOnRepository(repo);

      const imageId = "shield\nUS:I\n95\n\n";
      renderer.getMissingStyleImageResolver()(imageId);

      const sprite = repo.getSprite(imageId);
      expect(repo.hasSprite(imageId)).to.be.true;
      expect(sprite.width).to.be.greaterThan(1);
      expect(sprite.height).to.be.greaterThan(1);
    });
  });
});
