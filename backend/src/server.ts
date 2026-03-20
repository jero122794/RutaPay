// backend/src/server.ts
import { buildApp } from "./app";
import { env } from "./shared/env";
import { startJobs } from "./jobs/start-jobs";

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

start().catch((err) => {
  console.error(err);
  process.exit(1);
});