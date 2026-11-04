import assert from "node:assert/strict";
import test from "node:test";
import { NULL_REASON_LABEL } from "./labels.ts";
import {
  analyticsQuery,
  listQuery,
  parseFilterState,
  rangeError,
  toSearchParams,
  withFilterPatch,
} from "./search.ts";

const defaults = { from: "2026-10-04", to: "2026-11-02" };

test("período default preenche datas ausentes e descarta unitId inválido", () => {
  const state = parseFilterState(
    new URLSearchParams("unitId=nao-e-uuid&status=OPEN,NOPE,RESOLVED"),
    defaults,
  );
  assert.equal(state.from, "2026-10-04");
  assert.equal(state.to, "2026-11-02");
  assert.equal(state.unitId, null);
  assert.deepEqual(state.statuses, ["OPEN", "RESOLVED"]);
  assert.equal(state.sort, "priority");
  assert.equal(state.order, "desc");
});

test("query analítica omite unidade e envia status em CSV", () => {
  const state = parseFilterState(
    new URLSearchParams("from=2026-11-02&to=2026-11-02&status=OPEN,IN_PROGRESS"),
    defaults,
  );
  assert.equal(
    analyticsQuery(state),
    "from=2026-11-02&to=2026-11-02&status=OPEN%2CIN_PROGRESS",
  );
});

test("lista envia paginação e ordenação; a URL omite os defaults", () => {
  const state = parseFilterState(
    new URLSearchParams("from=2026-10-04&to=2026-11-02&page=2&sort=openedAt&order=asc"),
    defaults,
  );
  assert.match(listQuery(state), /page=2/);
  assert.match(listQuery(state), /sort=openedAt/);
  assert.match(listQuery(state), /order=asc/);
  const search = toSearchParams(state);
  assert.equal(search.get("page"), "2");
  assert.equal(search.get("sort"), "openedAt");
  assert.equal(search.get("pageSize"), null);
});

test("troca de filtro volta para a primeira página", () => {
  const state = parseFilterState(new URLSearchParams("page=4"), defaults);
  const next = withFilterPatch(state, {
    unitId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  });
  assert.equal(next.page, 1);
  assert.equal(next.unitId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
});

test("período invertido é rejeitado antes da consulta", () => {
  assert.match(rangeError({ from: "2026-11-03", to: "2026-11-02" }) ?? "", /anterior/);
  assert.equal(rangeError({ from: "2026-11-02", to: "2026-11-02" }), null);
});

test("todo motivo de KPI nulo tem texto de interface", () => {
  assert.equal(
    NULL_REASON_LABEL.no_resolved_in_scope.includes("resolvidas"),
    true,
  );
  assert.equal(NULL_REASON_LABEL.no_pending_in_scope.includes("pendências"), true);
  assert.equal(
    NULL_REASON_LABEL.no_unit_with_pending.includes("pendências"),
    true,
  );
});
