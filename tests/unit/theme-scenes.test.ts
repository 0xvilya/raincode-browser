import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ThemeScene, sceneForTheme } from "../../src/renderer/ThemeScene";

describe("local theme scenery", () => {
  it("maps legacy palette choices to distinct artwork", () => {
    expect(sceneForTheme("london")).toBe("london");
    expect(sceneForTheme("midnight")).toBe("space");
    expect(sceneForTheme("amber")).toBe("paris");
    expect(sceneForTheme("fog")).toBe("mountain");
    expect(sceneForTheme("graphite")).toBe("minimal-dark");
  });
  it("renders different Tokyo, New York and Paris scenes with no external assets", () => {
    const scenes = ["tokyo", "newYork", "paris"].map((theme) =>
      renderToStaticMarkup(createElement(ThemeScene, { theme })),
    );
    expect(new Set(scenes).size).toBe(3);
    expect(scenes[0]).toContain("scene-tokyo");
    expect(scenes[1]).toContain("scene-new-york");
    expect(scenes[2]).toContain("scene-paris");
    for (const markup of scenes) {
      expect(markup).toContain("<svg");
      expect(markup).not.toMatch(/https?:\/\//);
      expect(markup).toContain('aria-hidden="true"');
    }
  });
  it("preserves the existing London image element", () => {
    expect(
      renderToStaticMarkup(createElement(ThemeScene, { theme: "london" })),
    ).toBe('<div class="scene" data-scene="london" aria-hidden="true"></div>');
  });
  it("renders a snowy Manhattan scene without running weather animations", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeScene, { theme: "newYork" }),
    );
    expect(markup).toContain('data-landmark="manhattan-skyline"');
    expect(markup).toContain('data-landmark="brooklyn-bridge"');
    expect(markup).toContain('data-weather="snow"');
    expect(markup).not.toMatch(/<animate|<script|animation:/);
    expect(markup).toBe(
      renderToStaticMarkup(createElement(ThemeScene, { theme: "new-york" })),
    );
  });
  it("gives Tokyo its own tower and crossing without New York weather", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeScene, { theme: "tokyo" }),
    );
    expect(markup).toContain('data-landmark="tokyo-tower"');
    expect(markup).toContain('data-landmark="shibuya-crossing"');
    expect(markup).not.toContain('data-weather="snow"');
  });
  it("keeps gradient references local when scenes appear together in previews", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        ...["tokyo", "newYork", "space", "ocean", "minimalLight", "tokyo"].map(
          (theme, key) => createElement(ThemeScene, { theme, key }),
        ),
      ),
    );
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const reference of markup.matchAll(/url\(#([^)]+)\)/g)) {
      expect(ids).toContain(reference[1]);
    }
  });
});
