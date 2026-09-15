# Operations KPI dashboard

M-T609-V1 scenario seed. The **Active Accounts** KPI is displayed on `/overview` and `/accounts/:region`.

Trace: `src/ingest/liveAccounts.js` -> `src/api/kpiRoute.js` -> `src/ui/OverviewKpiCard.js` and `src/ui/RegionKpiDetail.js`.

Daily exports live in `data/snapshots/daily.json`; fixture conditions are in `fixtures/kpi-source-cases.json`. Current production behavior exposes partial upstream counts as live and has no visible provenance.