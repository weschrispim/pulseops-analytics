import assert from "node:assert/strict";
import { test } from "node:test";
import { hasEligibleRanking } from "./ranking.ts";

test("sem rank não há unidade elegível para o ranking", () => {
  assert.equal(hasEligibleRanking([]), false);
  assert.equal(
    hasEligibleRanking([
      { rank: null },
      { rank: null },
    ]),
    false,
  );
});

test("uma unidade com posição mantém o ranking", () => {
  assert.equal(
    hasEligibleRanking([
      { rank: 1 },
      { rank: null },
    ]),
    true,
  );
});
