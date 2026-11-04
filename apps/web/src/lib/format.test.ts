import assert from "node:assert/strict";
import test from "node:test";
import { formatCivil, formatHours, formatPercent } from "./format.ts";

test("formata taxa, horas e data civil sem inventar valor", () => {
  assert.equal(formatPercent(0.552213), "55,2%");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatHours(42.0874), "42,1 h");
  assert.equal(formatHours(null), "—");
  assert.equal(formatCivil("2026-11-02"), "02/11/2026");
});
