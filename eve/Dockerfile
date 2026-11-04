# Agent Blueprint on Eve, for Railway and your own server (KTD12). The sandbox is Daytona, chosen
# before eve build, because the build prepares the provider's snapshot and these hosts have no
# Docker daemon. Build from the product root, since eve build reads skills/ outside eve/:
#
#   docker build -f eve/Dockerfile --build-arg DAYTONA_API_KEY --build-arg WORKFLOW_TARGET_WORLD \
#     --build-arg AB_MCP_OAUTH_ISSUER --build-arg AB_MCP_OAUTH_SUBJECTS --build-arg AB_MCP_OAUTH_RESOURCE \
#     --build-arg AB_ROSTER --build-arg AB_MODEL_LEAD --build-arg AB_REASONING_LEAD .
#
# BuildKit reads eve/Dockerfile.dockerignore beside this file. The legacy builder ignores it and
# sends the whole folder, so the build stage removes local dependencies, build output and env files
# before it installs, and the image takes only that cleaned tree.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN rm -rf eve/node_modules eve/.eve eve/.output eve/.vercel eve/.workflow-data eve/apps/web/.next eve/.env*
WORKDIR /app/eve
RUN npm ci
ENV AB_SANDBOX=daytona
# Railway passes a service variable to the build only when it is declared here. The key stays in
# this stage; the image below copies the built tree, not this stage's history. eve build fixes the
# workflow world from WORKFLOW_TARGET_WORLD (Railway: @workflow/world-postgres); unset, the local world.
ARG DAYTONA_API_KEY
ARG WORKFLOW_TARGET_WORLD
# The MCP channel's OAuth sign-in is read at build too, because Eve fixes the channel's routes then
# (KTD8); unset, the channel takes AB_MCP_TOKEN only. Set the same values at run time as well.
ARG AB_MCP_OAUTH_ISSUER
ARG AB_MCP_OAUTH_SUBJECTS
ARG AB_MCP_OAUTH_RESOURCE
# agent.ts fixes the lead's model and the session budget from the roster at build (KTD8). Set the same
# values at run time as well, where the helpers read them.
ARG AB_ROSTER
ARG AB_MODEL_LEAD
ARG AB_REASONING_LEAD
# Each ARG above reaches this command as an environment variable. Never write "$DAYTONA_API_KEY" on
# a RUN line: BuildKit prints the line with the value filled in, and Railway shows that build log.
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production AB_SANDBOX=daytona
COPY --from=build /app /app
WORKDIR /app/eve
EXPOSE 3000
# eve start listens on $PORT (Railway sets it), else 3000. Built without WORKFLOW_TARGET_WORLD, the
# local workflow world keeps its runs in /app/eve/.eve/.workflow-data; mount a persistent volume there.
# eve runs as PID 1 in exec form, never under npm or a shell: it traps the SIGTERM a redeploy sends,
# stops its server and exits 0, while npm exits 143 and the host reports the stop as a crash.
CMD ["node", "node_modules/eve/bin/eve.js", "start", "--host", "0.0.0.0"]
