// The workflow world agent.ts hands Eve, from WORKFLOW_TARGET_WORLD read at build. The Postgres world
// loads through lib/postgres-world.ts, which adds the queue route's delivery proof (ruling 83). This
// module imports nothing, because agent.ts is bundled into every build: importing postgres-world.ts
// there would bundle world-postgres, pg and Graphile into a build that has no Postgres.

/** The world module for a WORKFLOW_TARGET_WORLD: lib/postgres-world.ts for Postgres, others as given. */
export function workflowWorld(target = process.env.WORKFLOW_TARGET_WORLD): string | undefined {
  return target === "@workflow/world-postgres" ? "#lib/postgres-world.ts" : target;
}
