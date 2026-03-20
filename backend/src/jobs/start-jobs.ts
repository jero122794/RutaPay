// backend/src/jobs/start-jobs.ts
import { registerOverdueCheckJob } from "./overdue-check.job.js";
import { registerUpcomingJobs } from "./upcoming-payments.job.js";

let started = false;

export const startJobs = (): void => {
  if (started) return;
  started = true;

  registerOverdueCheckJob();
  registerUpcomingJobs();
};

