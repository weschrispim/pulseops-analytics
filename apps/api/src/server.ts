import { buildApp } from "./app.js";
import { config } from "./config.js";

async function main() {
  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    {
      authMode: config.authMode,
      demoOrganizationId: config.demoOrganizationId,
    },
    "PulseOps API listening (demo auth — not for production)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
