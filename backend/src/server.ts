// backend/src/server.ts
import { buildApp } from "./app.js";
import { env } from "./shared/env.js";
import { startJobs } from "./jobs/start-jobs.js";

const start = async (): Promise<void> => {
  const app = await buildApp();
  try {
    startJobs();
    await app.listen({ host: "0.0.0.0", port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

await start();