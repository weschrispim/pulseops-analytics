import assert from "node:assert/strict";
import test from "node:test";
import { insightSearch } from "./insight-link.ts";
import { parseFilterState } from "./search.ts";

const state = parseFilterState(
  new URLSearchParams("from=2026-10-04&to=2026-11-02&page=3&status=OPEN"),
  { from: "2026-10-04", to: "2026-11-02" },
);

test("o destino do insight preserva o período, troca a unidade e zera a página", () => {
  const search = insightSearch(state, {
    view: "occurrences",
    unitId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    statuses: null,
    sort: "priority",
    order: "desc",
  });
  const params = new URLSearchParams(search);
  assert.equal(params.get("from"), "2026-10-04");
  assert.equal(params.get("to"), "2026-11-02");
  assert.equal(params.get("unitId"), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
  assert.equal(params.get("status"), null);
  assert.equal(params.get("page"), null);
});

test("SLA navega para resolvidas da unidade filtrada", () => {
  const params = new URLSearchParams(
    insightSearch(state, {
      view: "occurrences",
      unitId: null,
      statuses: ["RESOLVED"],
      sort: "slaDueAt",
      order: "asc",
    }),
  );
  assert.equal(params.get("status"), "RESOLVED");
  assert.equal(params.get("sort"), "slaDueAt");
  assert.equal(params.get("order"), "asc");
  assert.equal(params.get("unitId"), null);
});
