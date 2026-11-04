/**
 * PostgreSQL local sem Docker.
 * Necessário neste ambiente: Windows roda dentro de uma VM sem nested
 * virtualization, então o Docker Desktop não inicia.
 * O binário oficial do pacote é Windows x64; em ARM ele só carrega via Node x64.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "../../..");

if (os.arch() !== "x64") {
  const nodeX64 = path.join(repoRoot, ".tools", "node-x64", "node.exe");
  const child = spawn(nodeX64, [scriptPath], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const databaseDir = path.join(repoRoot, ".local", "postgres");
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "pulseops",
    password: "pulseops",
    port: 5432,
    persistent: true,
    autoRehydrateSymlinks: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  try {
    await pg.initialise();
    console.log("Cluster PostgreSQL inicializado em", databaseDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already|exist|initdb/i.test(message)) {
      throw error;
    }
    console.log("Cluster já existente:", message);
  }

  await pg.start();

  try {
    await pg.createDatabase("pulseops");
    console.log("Database pulseops criado.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) {
      throw error;
    }
    console.log("Database pulseops já existe.");
  }

  console.log(
    "PostgreSQL local em postgresql://pulseops:pulseops@localhost:5432/pulseops",
  );
  console.log("Processo mantido vivo. Encerre com Ctrl+C.");
  await new Promise(() => {});
}
