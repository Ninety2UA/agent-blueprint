import { defineSchedule } from "eve/schedules";
import { scheduledCleanup } from "../lib/demo-cleanup";

// Hourly at minute 0, on the demo only (KTD13, R17): close pull requests older than 24 hours and
// delete ab/ branches older than 7 days whose session ended, on the sample repository, under the
// GitHub App's token. The handler runs the cleanup itself, so no session starts and no model is
// called; on a copy without AB_DEMO=1 it returns at once. The rules are in lib/demo-cleanup.ts.
// The demo's team is on Vercel Pro (since 2026-10-29); Hobby allows a cron at most once a day.
export default defineSchedule({
  cron: "0 * * * *",
  async run() {
    await scheduledCleanup();
  },
});
