import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveMetrics,
  isOverduePending,
  priorityScore,
  rankUnits,
  sumAggregates,
  type UnitAggregate,
} from "./metrics.js";

const emptyCounts = {
  totalOccurrences: 0,
  pendingCount: 0,
  overduePendingCount: 0,
  resolvedCount: 0,
  slaMetCount: 0,
  handleSecondsSum: 0,
  waitSecondsSum: 0,
};

describe("pendências, vencidas e tempos", () => {
  const now = new Date("2026-11-02T15:00:00.000Z");

  it("marca vencida só pendente com sla estritamente anterior a referenceNow", () => {
    assert.equal(
      isOverduePending("OPEN", new Date("2026-11-02T14:59:59.000Z"), now),
      true,
    );
    assert.equal(
      isOverduePending("IN_PROGRESS", new Date("2026-11-02T15:00:00.000Z"), now),
      false,
    );
    assert.equal(
      isOverduePending("RESOLVED", new Date("2026-11-01T00:00:00.000Z"), now),
      false,
    );
  });

  it("calcula tratativa, espera e SLA com os denominadores certos", () => {
    const derived = deriveMetrics({
      ...emptyCounts,
      totalOccurrences: 4,
      pendingCount: 2,
      overduePendingCount: 1,
      resolvedCount: 2,
      slaMetCount: 1,
      handleSecondsSum: 2 * 3600,
      waitSecondsSum: 4 * 3600,
    });
    assert.equal(derived.avgHandleTimeHours, 1);
    assert.equal(derived.avgWaitTimeHours, 2);
    assert.equal(derived.slaComplianceRate, 0.5);
    assert.equal(derived.overdueRate, 0.5);
    assert.equal(derived.nullReasons.avgHandleTimeHours, null);
  });

  it("retorna null quando o denominador é zero", () => {
    const noResolved = deriveMetrics({
      ...emptyCounts,
      totalOccurrences: 1,
      pendingCount: 1,
      overduePendingCount: 0,
      waitSecondsSum: 3600,
    });
    assert.equal(noResolved.avgHandleTimeHours, null);
    assert.equal(noResolved.slaComplianceRate, null);
    assert.equal(noResolved.nullReasons.avgHandleTimeHours, "no_resolved_in_scope");
    assert.equal(noResolved.avgWaitTimeHours, 1);

    const noPending = deriveMetrics({
      ...emptyCounts,
      totalOccurrences: 1,
      resolvedCount: 1,
      slaMetCount: 1,
      handleSecondsSum: 7200,
    });
    assert.equal(noPending.avgWaitTimeHours, null);
    assert.equal(noPending.overdueRate, null);
    assert.equal(noPending.nullReasons.avgWaitTimeHours, "no_pending_in_scope");
    assert.equal(noPending.slaComplianceRate, 1);
  });

  it("soma agregados sem média de médias", () => {
    const total = sumAggregates([
      {
        ...emptyCounts,
        resolvedCount: 1,
        slaMetCount: 1,
        handleSecondsSum: 3600,
        totalOccurrences: 1,
      },
      {
        ...emptyCounts,
        resolvedCount: 1,
        slaMetCount: 0,
        handleSecondsSum: 10800,
        totalOccurrences: 1,
      },
    ]);
    assert.equal(deriveMetrics(total).avgHandleTimeHours, 2);
    assert.equal(deriveMetrics(total).slaComplianceRate, 0.5);
  });
});

describe("ranking de gargalo", () => {
  function unit(
    name: string,
    pending: number,
    overdue: number,
    handleHours: number | null,
  ): UnitAggregate {
    return {
      unitId: name,
      unitName: name,
      totalOccurrences: pending,
      pendingCount: pending,
      overduePendingCount: overdue,
      resolvedCount: handleHours === null ? 0 : 1,
      slaMetCount: 0,
      handleSecondsSum: handleHours === null ? 0 : handleHours * 3600,
      waitSecondsSum: 0,
    };
  }

  it("ordena por taxa, volume de vencidas, pendências, tratativa e nome", () => {
    const ranked = rankUnits([
      unit("Sul", 10, 5, 10),
      unit("Norte", 10, 5, 30),
      unit("Leste", 4, 4, 1),
      unit("Oeste", 0, 0, 99),
      unit("Centro", 8, 4, null),
    ]);
    assert.deepEqual(
      ranked.map((row) => [row.unitName, row.rank]),
      [
        ["Leste", 1],
        ["Norte", 2],
        ["Sul", 3],
        ["Centro", 4],
        ["Oeste", null],
      ],
    );
  });

  it("não elege gargalo quando nenhuma unidade tem pendência", () => {
    const ranked = rankUnits([unit("Oeste", 0, 0, 10), unit("Centro", 0, 0, null)]);
    assert.equal(ranked.every((row) => row.rank === null), true);
  });
});

describe("prioridade da ocorrência", () => {
  it("soma vencimento, criticidade e horas além do SLA com teto de 500", () => {
    assert.equal(
      priorityScore({ isOverdue: true, criticality: "HIGH", hoursOverdue: 10 }),
      1310,
    );
    assert.equal(
      priorityScore({ isOverdue: false, criticality: "CRITICAL", hoursOverdue: 80 }),
      400,
    );
    assert.equal(
      priorityScore({ isOverdue: true, criticality: "LOW", hoursOverdue: 900 }),
      1600,
    );
  });
});
