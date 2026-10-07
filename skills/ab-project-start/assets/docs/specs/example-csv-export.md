# Feature: CSV Export

> **Note:** This is an example spec showing the expected format. Delete this file when you start your project.

**Date:** 2026-03-04
**Status:** draft
**Priority:** P1
**Goal:** Supports "Make data accessible" objective in GOALS.md

## Problem

Users need to export their data for use in spreadsheets and BI tools. Currently the only way to access data is through the UI, which doesn't work for bulk analysis or reporting.

## Proposed Solution

Add a "Download CSV" button to the data table views. When clicked, generate a CSV file server-side with the current filter/sort applied and stream it to the user's browser.

## Requirements

### Functional
- [ ] Export button visible on all data table views
- [ ] Export respects current filters and sort order
- [ ] CSV includes column headers matching table headers
- [ ] Large exports (>10K rows) stream progressively
- [ ] Filename includes table name and date: `users-2026-03-04.csv`

### Non-Functional
- [ ] Performance: Export starts within 2s for up to 100K rows
- [ ] Security: Respects user permissions (only export data user can view)
- [ ] Accessibility: Export button keyboard-navigable with screen reader label

## Acceptance Criteria

- Given a user on the users table, when they click "Download CSV", then a CSV file downloads with all visible columns
- Given filters are applied, when exporting, then only filtered rows appear in the CSV
- Given 50K rows, when exporting, then the download starts within 2s (streaming)
- Given a user without admin role, when exporting users table, then only their own data appears

## Out of Scope

- Excel (.xlsx) format — future enhancement
- Scheduled/automated exports — separate feature
- PDF export — not planned

## Open Questions

- [ ] Should we include hidden columns in the export? — Ask product team
- [x] Max export size limit? — 500K rows, show warning above 100K

## Dependencies

- Requires streaming response support in API framework
- Blocked by: nothing
