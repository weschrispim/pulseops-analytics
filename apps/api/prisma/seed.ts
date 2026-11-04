/**
 * Deterministic seed for PulseOps Analytics (Phase 3).
 * Primary org: Nova Horizontes — 5 units, 5000 employees, ~15000 occurrences.
 * Secondary org: Aurora Serviços Demo — small fixture for isolation tests.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  Criticality,
  OccurrenceStatus,
  OccurrenceType,
  PrismaClient,
} from "@prisma/client";
import {
  DEMO_ORG_PRIMARY_ID,
  DEMO_ORG_SECONDARY_ID,
  DEMO_REFERENCE_NOW_ISO,
  DEMO_SLA_HOURS_BY_CRITICALITY,
  DEMO_UNIT_IDS,
} from "@pulseops/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();

const SEED_MAGIC = 20261102;
const REFERENCE_NOW = new Date(DEMO_REFERENCE_NOW_ISO);
const TARGET_OCCURRENCES = 15_000;
const TARGET_EMPLOYEES = 5_000;

const TYPES: OccurrenceType[] = [
  "MISSING_PUNCH",
  "DUPLICATE_PUNCH",
  "OUT_OF_GEOFENCE",
  "SHIFT_MISMATCH",
  "MANUAL_ADJUSTMENT",
];

type UnitPlan = {
  code: keyof typeof DEMO_UNIT_IDS;
  name: string;
  id: string;
  employees: number;
  occurrences: number;
  profile:
    | "balanced"
    | "bottleneck" // high overdue rate
    | "slow_handle"
    | "critical_cluster"
    | "healthy";
};

const UNIT_PLANS: UnitPlan[] = [
  {
    code: "CENTER",
    name: "Centro",
    id: DEMO_UNIT_IDS.CENTER,
    employees: 1400,
    occurrences: 4200,
    profile: "balanced",
  },
  {
    code: "NORTH",
    name: "Norte",
    id: DEMO_UNIT_IDS.NORTH,
    employees: 1100,
    occurrences: 3300,
    profile: "bottleneck",
  },
  {
    code: "SOUTH",
    name: "Sul",
    id: DEMO_UNIT_IDS.SOUTH,
    employees: 1000,
    occurrences: 2700,
    profile: "slow_handle",
  },
  {
    code: "EAST",
    name: "Leste",
    id: DEMO_UNIT_IDS.EAST,
    employees: 900,
    occurrences: 2550,
    profile: "critical_cluster",
  },
  {
    code: "WEST",
    name: "Oeste",
    id: DEMO_UNIT_IDS.WEST,
    employees: 600,
    occurrences: 2250,
    profile: "healthy",
  },
];

function assertPlans() {
  const emp = UNIT_PLANS.reduce((s, u) => s + u.employees, 0);
  const occ = UNIT_PLANS.reduce((s, u) => s + u.occurrences, 0);
  if (emp !== TARGET_EMPLOYEES) {
    throw new Error(`Employee plan ${emp} != ${TARGET_EMPLOYEES}`);
  }
  if (occ !== TARGET_OCCURRENCES) {
    throw new Error(`Occurrence plan ${occ} != ${TARGET_OCCURRENCES}`);
  }
}

/** Mulberry32 PRNG — deterministic. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicUuid(label: string): string {
  const hash = createHash("sha256").update(label).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function hoursAgo(hours: number): Date {
  return new Date(REFERENCE_NOW.getTime() - hours * 3600_000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600_000);
}

function firstNames(rng: () => number): string {
  const names = [
    "Ana",
    "Bruno",
    "Carla",
    "Diego",
    "Elena",
    "Fábio",
    "Gisele",
    "Hugo",
    "Iris",
    "João",
    "Karen",
    "Lucas",
    "Marina",
    "Nuno",
    "Olívia",
    "Paulo",
    "Queila",
    "Rafael",
    "Sara",
    "Tiago",
  ];
  return pick(rng, names);
}

function lastNames(rng: () => number): string {
  const names = [
    "Almeida",
    "Barbosa",
    "Costa",
    "Dias",
    "Esteves",
    "Ferreira",
    "Gomes",
    "Hahn",
    "Ibrahim",
    "Jesus",
    "Klein",
    "Lima",
    "Moraes",
    "Nogueira",
    "Oliveira",
    "Pereira",
    "Queiroz",
    "Rocha",
    "Silva",
    "Teixeira",
  ];
  return pick(rng, names);
}

type OccDraft = {
  id: string;
  organizationId: string;
  unitId: string;
  employeeId: string;
  type: OccurrenceType;
  status: OccurrenceStatus;
  criticality: Criticality;
  openedAt: Date;
  resolvedAt: Date | null;
  slaDueAt: Date;
  createdAt: Date;
};

function buildOccurrenceForProfile(
  rng: () => number,
  profile: UnitPlan["profile"],
  organizationId: string,
  unitId: string,
  employeeId: string,
  index: number,
): OccDraft {
  const type = pick(rng, TYPES);
  let criticality: Criticality;
  let status: OccurrenceStatus;
  let openedHoursAgo: number;
  let handleHours: number | null = null;

  switch (profile) {
    case "bottleneck": {
      // Many open/in-progress past SLA
      criticality = pick(rng, [
        "HIGH",
        "HIGH",
        "CRITICAL",
        "MEDIUM",
        "LOW",
      ] as Criticality[]);
      const roll = rng();
      if (roll < 0.55) {
        status = roll < 0.3 ? "OPEN" : "IN_PROGRESS";
        openedHoursAgo = 40 + Math.floor(rng() * 200); // often overdue
      } else {
        status = "RESOLVED";
        openedHoursAgo = 20 + Math.floor(rng() * 400);
        handleHours = 10 + Math.floor(rng() * 40);
      }
      break;
    }
    case "slow_handle": {
      criticality = pick(rng, [
        "MEDIUM",
        "MEDIUM",
        "LOW",
        "HIGH",
      ] as Criticality[]);
      const roll = rng();
      if (roll < 0.35) {
        status = rng() < 0.5 ? "OPEN" : "IN_PROGRESS";
        openedHoursAgo = 5 + Math.floor(rng() * 60);
      } else {
        status = "RESOLVED";
        openedHoursAgo = 80 + Math.floor(rng() * 500);
        handleHours = 48 + Math.floor(rng() * 120); // slow
      }
      break;
    }
    case "critical_cluster": {
      criticality = pick(rng, [
        "CRITICAL",
        "CRITICAL",
        "HIGH",
        "HIGH",
        "MEDIUM",
        "LOW",
      ] as Criticality[]);
      const roll = rng();
      if (roll < 0.4) {
        status = rng() < 0.5 ? "OPEN" : "IN_PROGRESS";
        openedHoursAgo = 10 + Math.floor(rng() * 80);
      } else {
        status = "RESOLVED";
        openedHoursAgo = 30 + Math.floor(rng() * 300);
        handleHours = 6 + Math.floor(rng() * 36);
      }
      break;
    }
    case "healthy": {
      criticality = pick(rng, [
        "LOW",
        "LOW",
        "MEDIUM",
        "HIGH",
      ] as Criticality[]);
      const roll = rng();
      if (roll < 0.2) {
        status = rng() < 0.5 ? "OPEN" : "IN_PROGRESS";
        openedHoursAgo = 2 + Math.floor(rng() * 20); // usually within SLA
      } else {
        status = "RESOLVED";
        openedHoursAgo = 20 + Math.floor(rng() * 400);
        const slaH = DEMO_SLA_HOURS_BY_CRITICALITY[criticality];
        handleHours = Math.max(1, Math.floor(rng() * (slaH * 0.8)));
      }
      break;
    }
    default: {
      criticality = pick(rng, [
        "LOW",
        "MEDIUM",
        "MEDIUM",
        "HIGH",
        "CRITICAL",
      ] as Criticality[]);
      const roll = rng();
      if (roll < 0.4) {
        status = roll < 0.22 ? "OPEN" : "IN_PROGRESS";
        openedHoursAgo = 5 + Math.floor(rng() * 100);
      } else {
        status = "RESOLVED";
        openedHoursAgo = 24 + Math.floor(rng() * 450);
        handleHours = 4 + Math.floor(rng() * 60);
      }
    }
  }

  const openedAt = hoursAgo(openedHoursAgo);
  const slaDueAt = addHours(
    openedAt,
    DEMO_SLA_HOURS_BY_CRITICALITY[criticality],
  );
  let resolvedAt: Date | null = null;
  if (status === "RESOLVED") {
    const h = handleHours ?? 12;
    resolvedAt = addHours(openedAt, h);
    if (resolvedAt > REFERENCE_NOW) {
      resolvedAt = new Date(REFERENCE_NOW.getTime() - 60_000);
    }
  }

  return {
    id: deterministicUuid(`occ:primary:${unitId}:${index}`),
    organizationId,
    unitId,
    employeeId,
    type,
    status,
    criticality,
    openedAt,
    resolvedAt,
    slaDueAt,
    createdAt: openedAt,
  };
}

async function seedPrimary() {
  const rng = mulberry32(SEED_MAGIC);

  await prisma.organization.create({
    data: {
      id: DEMO_ORG_PRIMARY_ID,
      name: "Nova Horizontes Alimentos Ltda.",
      createdAt: hoursAgo(24 * 400),
    },
  });

  for (const unit of UNIT_PLANS) {
    await prisma.unit.create({
      data: {
        id: unit.id,
        organizationId: DEMO_ORG_PRIMARY_ID,
        code: unit.code,
        name: unit.name,
        createdAt: hoursAgo(24 * 390),
      },
    });
  }

  // Employees
  const employeesByUnit = new Map<string, string[]>();
  let empIndex = 0;
  const employeeRows: Array<{
    id: string;
    organizationId: string;
    unitId: string;
    externalCode: string;
    fullName: string;
    active: boolean;
    createdAt: Date;
  }> = [];

  for (const unit of UNIT_PLANS) {
    const ids: string[] = [];
    for (let i = 0; i < unit.employees; i += 1) {
      empIndex += 1;
      const id = deterministicUuid(`emp:primary:${unit.code}:${i}`);
      ids.push(id);
      employeeRows.push({
        id,
        organizationId: DEMO_ORG_PRIMARY_ID,
        unitId: unit.id,
        externalCode: `NH-${unit.code}-${String(i + 1).padStart(5, "0")}`,
        fullName: `${firstNames(rng)} ${lastNames(rng)}`,
        active: rng() > 0.03,
        createdAt: hoursAgo(24 * (100 + Math.floor(rng() * 200))),
      });
    }
    employeesByUnit.set(unit.id, ids);
  }

  for (let i = 0; i < employeeRows.length; i += 500) {
    await prisma.employee.createMany({
      data: employeeRows.slice(i, i + 500),
    });
  }

  // Occurrences
  let globalOcc = 0;
  for (const unit of UNIT_PLANS) {
    const empIds = employeesByUnit.get(unit.id)!;
    const batch: OccDraft[] = [];
    for (let i = 0; i < unit.occurrences; i += 1) {
      const employeeId = empIds[Math.floor(rng() * empIds.length)]!;
      batch.push(
        buildOccurrenceForProfile(
          rng,
          unit.profile,
          DEMO_ORG_PRIMARY_ID,
          unit.id,
          employeeId,
          globalOcc,
        ),
      );
      globalOcc += 1;
      if (batch.length >= 500) {
        await prisma.occurrence.createMany({ data: batch.splice(0, batch.length) });
      }
    }
    if (batch.length) {
      await prisma.occurrence.createMany({ data: batch });
    }
  }
}

async function seedSecondary() {
  const rng = mulberry32(SEED_MAGIC + 99);
  const secondaryUnitId = deterministicUuid("unit:secondary:MAIN");

  await prisma.organization.create({
    data: {
      id: DEMO_ORG_SECONDARY_ID,
      name: "Aurora Serviços Demo Ltda.",
      createdAt: hoursAgo(24 * 100),
    },
  });

  await prisma.unit.create({
    data: {
      id: secondaryUnitId,
      organizationId: DEMO_ORG_SECONDARY_ID,
      code: "MAIN",
      name: "Principal",
      createdAt: hoursAgo(24 * 90),
    },
  });

  const empIds: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const id = deterministicUuid(`emp:secondary:${i}`);
    empIds.push(id);
    await prisma.employee.create({
      data: {
        id,
        organizationId: DEMO_ORG_SECONDARY_ID,
        unitId: secondaryUnitId,
        externalCode: `AU-${String(i + 1).padStart(3, "0")}`,
        fullName: `${firstNames(rng)} ${lastNames(rng)}`,
        active: true,
        createdAt: hoursAgo(24 * 50),
      },
    });
  }

  for (let i = 0; i < 50; i += 1) {
    const criticality = pick(rng, [
      "LOW",
      "MEDIUM",
      "HIGH",
    ] as Criticality[]);
    const status = pick(rng, [
      "OPEN",
      "IN_PROGRESS",
      "RESOLVED",
    ] as OccurrenceStatus[]);
    const openedAt = hoursAgo(5 + Math.floor(rng() * 200));
    const slaDueAt = addHours(
      openedAt,
      DEMO_SLA_HOURS_BY_CRITICALITY[criticality],
    );
    const resolvedAt =
      status === "RESOLVED"
        ? addHours(openedAt, 2 + Math.floor(rng() * 20))
        : null;

    await prisma.occurrence.create({
      data: {
        id: deterministicUuid(`occ:secondary:${i}`),
        organizationId: DEMO_ORG_SECONDARY_ID,
        unitId: secondaryUnitId,
        employeeId: empIds[i % empIds.length]!,
        type: pick(rng, TYPES),
        status,
        criticality,
        openedAt,
        resolvedAt,
        slaDueAt,
        createdAt: openedAt,
      },
    });
  }
}

async function main() {
  assertPlans();
  console.log("Seeding PulseOps (deterministic)…");
  console.log(`referenceNow=${REFERENCE_NOW.toISOString()} seed=${SEED_MAGIC}`);

  // Wipe in FK-safe order
  await prisma.occurrence.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.organization.deleteMany();

  await seedPrimary();
  await seedSecondary();

  const counts = {
    organizations: await prisma.organization.count(),
    units: await prisma.unit.count(),
    employees: await prisma.employee.count(),
    occurrences: await prisma.occurrence.count(),
    primaryEmployees: await prisma.employee.count({
      where: { organizationId: DEMO_ORG_PRIMARY_ID },
    }),
    primaryOccurrences: await prisma.occurrence.count({
      where: { organizationId: DEMO_ORG_PRIMARY_ID },
    }),
    secondaryOccurrences: await prisma.occurrence.count({
      where: { organizationId: DEMO_ORG_SECONDARY_ID },
    }),
  };

  console.log(JSON.stringify({ ok: true, counts }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
