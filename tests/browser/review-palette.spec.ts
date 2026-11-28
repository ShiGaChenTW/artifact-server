import {AxeBuilder} from "@axe-core/playwright";
import {expect, test} from "@playwright/test";

import {publishNew} from "../support/publishing.js";
import {localLogin, startBrowserFixture, stopBrowserFixture, type BrowserFixture} from "./browser-fixture.js";

test.describe("ARTSV-7.6 Borderloop palette", () => {
  let fixture: BrowserFixture;
  test.beforeEach(async ({browser}) => {
    fixture = await startBrowserFixture(browser);
    await publishNew(fixture.server, fixture.installation, {
      accessSetting: "account_required",
      content: "<!doctype html><title>Palette fixture</title><main>Immutable artifact</main>",
      idempotencyKey: "palette-fixture-0001",
      name: "Palette fixture",
      path: "palette.html",
    });
    await localLogin(fixture);
    await fixture.page.goto(`${fixture.server.baseUrl}/review?project=prj_default`);
  });
  test.afterEach(async () => { await stopBrowserFixture(fixture); });

  for (const mode of ["moon", "dawn"]) {
    test(`UXR-018-B: Borderloop text and control boundaries meet AA in ${mode}`, async () => {
      const {page} = fixture;
      await page.getByRole("combobox", {name: "Color palette", exact: true}).selectOption("borderloop");
      if (mode === "dawn") await page.getByRole("button", {name: "Use light theme", exact: true}).click();
      const pairs = await page.locator("html").evaluate((element) => {
        const style = getComputedStyle(element);
        const color = (token: string) => style.getPropertyValue(`--color-${token}`).trim();
        const luminance = (token: string) => {
          const hex = color(token);
          const full = hex.length === 4 ? hex.replace(/[0-9a-f]/giu, "$&$&") : hex;
          const values = [1, 3, 5].map((start) => {
            const channel = Number.parseInt(full.slice(start, start + 2), 16) / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return (values[0] ?? 0) * 0.2126 + (values[1] ?? 0) * 0.7152 + (values[2] ?? 0) * 0.0722;
        };
        const ratio = (a: string, b: string) => {
          const values = [luminance(a), luminance(b)].toSorted((left, right) => left - right);
          return ((values[1] ?? 0) + 0.05) / ((values[0] ?? 0) + 0.05);
        };
        const surfaces = ["paper", "paper-2", "paper-3", "panel", "hover"];
        return [
          ...surfaces.flatMap((background) => ["ink", "ink-2", "muted", "accent", "cool", "warn", "ok", "bad"].map((foreground) => ({
            foreground, background, ratio: ratio(foreground, background), minimum: 4.5,
          }))),
          ...surfaces.flatMap((background) => ["rule", "rule-2", "focus"].map((foreground) => ({
            foreground, background, ratio: ratio(foreground, background), minimum: 3,
          }))),
          ...[["accent-ink", "accent"], ["accent-ink", "accent-hover"], ["ok", "ok-soft"], ["bad", "bad-soft"]].map(([foreground = "", background = ""]) => ({
            foreground, background, ratio: ratio(foreground, background), minimum: 4.5,
          })),
        ];
      });
      for (const pair of pairs) {
        expect(pair.ratio, `${mode}: ${pair.foreground} on ${pair.background}`).toBeGreaterThanOrEqual(pair.minimum);
      }
      const accessibility = await new AxeBuilder({page}).exclude("iframe").withRules(["color-contrast"]).analyze();
      expect(accessibility.violations).toEqual([]);
      await page.getByRole("button", {name: "Review board", exact: true}).click();
      const boardAccessibility = await new AxeBuilder({page}).exclude("iframe").withRules(["color-contrast"]).analyze();
      expect(boardAccessibility.violations).toEqual([]);
    });
  }

  test("UXR-018-F: unknown stored palettes fall back safely and remain selectable", async () => {
    const {page} = fixture;
    await page.evaluate(() => localStorage.setItem("artifact-review-palette", "unknown-palette"));
    await page.reload();
    await expect(page.getByRole("combobox", {name: "Color palette", exact: true})).toHaveValue("reader");
    await expect(page.locator("html")).toHaveClass(/theme-reader/u);
    await page.getByRole("combobox", {name: "Color palette", exact: true}).selectOption("borderloop");
    await expect(page.locator("html")).toHaveClass(/theme-borderloop/u);
  });

  test("UXR-018-B: palette and light/dark choices persist across reading, board and settings", async () => {
    const {page} = fixture;
    const palette = page.getByRole("combobox", {name: "Color palette", exact: true});
    await expect(palette).toHaveValue("reader");
    await palette.selectOption("borderloop");
    await expect(page.locator("html")).toHaveClass(/theme-borderloop/u);
    const frame = page.locator("iframe.as-artifact-frame");
    await expect(frame).toBeVisible();
    const original = await frame.elementHandle();
    await page.getByRole("button", {name: "Use light theme", exact: true}).click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/u);
    await expect.poll(() => page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--color-paper").trim().toUpperCase())).toBe("#F3F4F8");
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    expect(await frame.evaluate((element, previous) => element === previous, original)).toBe(true);
    await page.reload();
    await expect(palette).toHaveValue("borderloop");
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/u);
    await page.getByRole("button", {name: "Use dark theme", exact: true}).click();
    await expect.poll(() => page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--color-paper").trim().toUpperCase())).toBe("#15171E");
    await page.getByRole("link", {name: "Settings", exact: true}).click();
    await expect(palette).toHaveValue("borderloop");
    await palette.selectOption("reader");
    await page.reload();
    await expect(palette).toHaveValue("reader");
    await expect(page.locator("html")).toHaveClass(/theme-reader/u);
    await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  });
});
