import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  civilDateStartUtc,
  civilPeriodToUtcBounds,
  isInHalfOpenPeriod,
  toCivilDateInTimeZone,
} from "./period.js";

describe("civil period America/Sao_Paulo (half-open)", () => {
  it("maps civil start to expected UTC offset (-03)", () => {
    // 2026-11-02 00:00 America/Sao_Paulo = 2026-11-02 03:00 UTC
    const start = civilDateStartUtc("2026-11-02");
    assert.equal(start.toISOString(), "2026-11-02T03:00:00.000Z");
  });

  it("endExclusive is start of next civil day", () => {
    const bounds = civilPeriodToUtcBounds("2026-11-01", "2026-11-02");
    assert.equal(bounds.startUtc.toISOString(), "2026-11-01T03:00:00.000Z");
    assert.equal(
      bounds.endExclusiveUtc.toISOString(),
      "2026-11-03T03:00:00.000Z",
    );
  });

  it("includes startUtc and excludes endExclusiveUtc", () => {
    const bounds = civilPeriodToUtcBounds("2026-11-02", "2026-11-02");
    const atStart = new Date("2026-11-02T03:00:00.000Z");
    const justBeforeEnd = new Date("2026-11-03T02:59:59.999Z");
    const atEnd = new Date("2026-11-03T03:00:00.000Z");
    assert.equal(isInHalfOpenPeriod(atStart, bounds), true);
    assert.equal(isInHalfOpenPeriod(justBeforeEnd, bounds), true);
    assert.equal(isInHalfOpenPeriod(atEnd, bounds), false);
  });

  it("toCivilDateInTimeZone rounds trip referenceNow", () => {
    const ref = new Date("2026-11-02T15:00:00.000Z");
    assert.equal(toCivilDateInTimeZone(ref), "2026-11-02");
  });
});
