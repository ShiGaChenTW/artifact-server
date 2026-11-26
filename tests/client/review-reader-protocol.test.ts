import {describe, expect, test} from "vitest";

import {frameMessageSchema, hostMessageSchema} from "../../apps/web/src/review-frame/protocol.js";

const entry = {id: "as-heading-0", title: "Introduction", level: 1, active: true};
const rect = {threadId: "thread-1", x: 12, y: 20, width: 26, height: 26};

describe("ARTSV-7.5 reader protocol", () => {
  test("ARTSV-7.5-F: board zoom and mode require a bounded finite delta, boolean mode and supported version", () => {
    for (const delta of [-2_000, 0, 2_000]) {
      expect(frameMessageSchema.safeParse({type: "as-review-board-zoom", delta, v: 1}).success).toBe(true);
    }
    for (const delta of [NaN, Infinity, -Infinity, -2_001, 2_001, "100", null]) {
      expect(frameMessageSchema.safeParse({type: "as-review-board-zoom", delta, v: 1}).success).toBe(false);
    }
    expect(frameMessageSchema.safeParse({type: "as-review-board-zoom", delta: 1, v: 2}).success).toBe(false);
    for (const enabled of [true, false]) {
      expect(hostMessageSchema.safeParse({type: "as-review-board-mode", enabled, v: 1}).success).toBe(true);
    }
    for (const enabled of [1, "true", null]) {
      expect(hostMessageSchema.safeParse({type: "as-review-board-mode", enabled, v: 1}).success).toBe(false);
    }
    expect(hostMessageSchema.safeParse({type: "as-review-board-mode", enabled: true, v: 2}).success).toBe(false);
  });
  test("ARTSV-7.5-B: outline, viewport geometry and outline navigation cross a versioned boundary", () => {
    expect(frameMessageSchema.parse({type: "as-review-outline", entries: [entry], v: 1})).toEqual({type: "as-review-outline", entries: [entry], v: 1});
    expect(frameMessageSchema.parse({type: "as-review-anchor-rects", rects: [rect], v: 1})).toEqual({type: "as-review-anchor-rects", rects: [rect], v: 1});
    expect(hostMessageSchema.safeParse({type: "as-review-outline-scroll", id: entry.id, v: 1}).success).toBe(true);
    expect(frameMessageSchema.safeParse({type: "as-review-outline", entries: [], v: 1}).success).toBe(true);
    expect(frameMessageSchema.safeParse({type: "as-review-anchor-rects", rects: [], v: 1}).success).toBe(true);
  });

  test("ARTSV-7.5-F: hostile outlines cannot exceed the heading, text, id or version bounds", () => {
    for (const entries of [Array.from({length: 201}, () => entry), [{...entry, title: "x".repeat(301)}], [{...entry, id: "x".repeat(129)}], [{...entry, id: ""}], [{...entry, level: 4}], [{...entry, active: "true"}], [entry, entry], [entry, {...entry, id: "other"}]]) {
      expect(frameMessageSchema.safeParse({type: "as-review-outline", entries, v: 1}).success).toBe(false);
    }
    expect(frameMessageSchema.safeParse({type: "as-review-outline", entries: [entry], v: 2}).success).toBe(false);
    expect(hostMessageSchema.safeParse({type: "as-review-outline-scroll", id: "x".repeat(129), v: 1}).success).toBe(false);
    expect(hostMessageSchema.safeParse({type: "as-review-outline-scroll", id: entry.id, v: 2}).success).toBe(false);
  });

  test("ARTSV-7.5-F: geometry rejects non-finite values, oversized batches and hostile dimensions", () => {
    for (const change of [{x: Infinity}, {y: NaN}, {width: -1}, {height: 100_001}, {x: -100_001}, {threadId: ""}, {threadId: "x".repeat(257)}]) {
      expect(frameMessageSchema.safeParse({type: "as-review-anchor-rects", rects: [{...rect, ...change}], v: 1}).success).toBe(false);
    }
    expect(frameMessageSchema.safeParse({type: "as-review-anchor-rects", rects: [rect, rect], v: 1}).success).toBe(false);
    expect(frameMessageSchema.safeParse({type: "as-review-anchor-rects", rects: Array.from({length: 501}, () => rect), v: 1}).success).toBe(false);
  });
});
