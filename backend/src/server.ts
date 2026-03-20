import { buildApp } from "./app.js";
import { env } from "./shared/env.js";
import { startJobs } from "./jobs/start-jobs.js";
import { execSync } from "child_process";

const start = async (): Promise<void> => {
  const app = await buildApp();
  try {
    // Run seed if RUN_SEED env var is set
    if (process.env.RUN_SEED === 'true') {
      app.log.info('Running seed...')
      execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' })
      app.log.info('Seed completed successfully')
    }

    startJobs();
    await app.listen({ host: "0.0.0.0", port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

await start();