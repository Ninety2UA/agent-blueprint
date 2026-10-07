# Scope cutting patterns

Loaded on demand from SKILL.md when choosing how to cut: four shapes a cut can take. Each one removes features, never the tests, error handling or validation of what ships.

## The Walking Skeleton

Ship the thinnest possible end-to-end flow. For a CRUD app:
- One entity type
- Create and Read only (no Update/Delete yet)
- No pagination, no search, no filters
- Validation only for the fields this one flow uses
- Default styling only

## The Feature Flag Cut

Instead of removing code, gate it behind a feature flag:
- Ship the core feature enabled by default
- Keep partially-built features behind flags
- Enable them incrementally as they're finished
- Useful when the code is written but not tested

## The Hardcode Cut

Replace dynamic behavior with hardcoded values:
- Settings page? Hardcode defaults, add settings later
- Multi-currency support? Hardcode USD, add others later
- Configurable templates? Ship one template, add customization later

## The Manual Cut

Replace automation with manual process:
- Automated email notifications? Team sends them manually for now
- Self-service onboarding? Admin creates accounts manually
- Automated reporting? Export CSV, team builds reports manually
