# Operations KPI dashboard

M-T609-V1 scenario seed. The **Active Accounts** KPI is displayed on `/overview` and `/accounts/:region`.

Trace: `src/ingest/liveAccounts.js` -> `src/api/kpiRoute.js` -> `src/ui/OverviewKpiCard.js` and `src/ui/RegionKpiDetail.js`.

Daily exports live in `data/snapshots/daily.json`; fixture conditions are in `fixtures/kpi-source-cases.json`.

## KPI state model (KAN-212 / KAN-213)

`active_accounts` resolves to exactly one of three states:

| State | Condition | Value shown |
|---|---|---|
| `live` | Every required upstream (`KPI_REQUIRED_UPSTREAMS`, default `crm,billing,identity`) returned a usable, deduplicated pull with a consistent observation date | Sum of upstream counts; an old observation stays `live` but surfaces a freshness warning |
| `degraded` | Any required upstream disconnected, partial, timed out, stale, malformed, late, or conflicting | Latest suitable complete daily snapshot: `complete` flag set, all required sources present, observation date present, age <= `KPI_SNAPSHOT_MAX_AGE_DAYS` (default 7) |
| `unavailable` | No suitable snapshot exists | `null`, rendered as `—` — never 0, never labeled live |

Both UI surfaces render the state badge, source, observation date, and staleness as visible text adjacent to the KPI value. Run `npm test` (`node --test`) to exercise fixture cases C01-C20.
