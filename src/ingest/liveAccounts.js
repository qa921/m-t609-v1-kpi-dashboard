// Ingest layer for the Active Accounts KPI.
// State model (KAN-212):
//   live        - every required upstream returned a usable, deduplicated,
//                 consistent pull.
//   degraded    - any pull missing/unusable/conflicting: serve the latest
//                 suitable complete daily snapshot instead of summing partials.
//   unavailable - no suitable snapshot exists: value is null (rendered as an
//                 em dash by the views), never 0, never silently live.
// A snapshot is suitable only when it is complete, covers every required
// upstream, has an observation date, and is no older than
// KPI_SNAPSHOT_MAX_AGE_DAYS (default 7).

const PROBLEM_STATUSES = new Set(['disconnected', 'timeout', 'partial', 'stale', 'malformed', 'late']);

export const requiredUpstreams = (process.env.KPI_REQUIRED_UPSTREAMS || 'crm,billing,identity')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

export const snapshotMaxAgeDays = Number(process.env.KPI_SNAPSHOT_MAX_AGE_DAYS || 7);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ageInDays(observationDate, now) {
  const observed = Date.parse(`${observationDate}T00:00:00Z`);
  if (Number.isNaN(observed)) return null;
  return Math.floor((now.getTime() - observed) / MS_PER_DAY);
}

function normalizePull(raw, index) {
  const issues = [];
  const upstream = typeof raw?.upstream === 'string' && raw.upstream ? raw.upstream : null;
  const status = raw?.status ?? null;
  const connected = raw?.connected !== false && status !== 'disconnected';
  const count = typeof raw?.count === 'number' && Number.isFinite(raw.count) ? raw.count : null;
  const observationDate = typeof raw?.observationDate === 'string' && raw.observationDate
    ? raw.observationDate
    : null;

  if (!upstream) issues.push({ type: 'malformed', detail: `pull #${index} has no upstream name` });
  if (status && PROBLEM_STATUSES.has(status)) issues.push({ type: status, upstream });
  if (status && !PROBLEM_STATUSES.has(status)) issues.push({ type: 'malformed', upstream, detail: `unknown status '${status}'` });
  if (!connected && status !== 'disconnected') issues.push({ type: 'disconnected', upstream });
  if (count === null) issues.push({ type: 'malformed', upstream, detail: 'count is missing or not a finite number' });

  const usable = Boolean(upstream) && connected && count !== null && !(status && PROBLEM_STATUSES.has(status));
  return { upstream, status, connected, count, observationDate, usable, issues };
}

export function evaluateLivePulls(pulls) {
  const byUpstream = new Map();
  const issues = [];
  (pulls || []).forEach((raw, index) => {
    const pull = normalizePull(raw, index);
    issues.push(...pull.issues);
    if (!pull.upstream) return;
    const previous = byUpstream.get(pull.upstream);
    if (!previous) {
      byUpstream.set(pull.upstream, pull);
      return;
    }
    // Same upstream reported twice: identical rows are deduplicated; differing
    // rows are a conflict and make the pull unusable rather than double-counted.
    if (previous.count === pull.count
      && previous.observationDate === pull.observationDate
      && previous.usable === pull.usable) {
      issues.push({ type: 'deduplicated', upstream: pull.upstream });
    } else {
      issues.push({ type: 'conflict', upstream: pull.upstream });
      byUpstream.set(pull.upstream, { ...previous, usable: false });
    }
  });

  const deduped = [...byUpstream.values()];
  const missing = requiredUpstreams.filter((name) => {
    const pull = byUpstream.get(name);
    return !pull || !pull.usable;
  });
  const usableDates = new Set(
    deduped.filter((p) => p.usable && p.observationDate).map((p) => p.observationDate),
  );
  const conflicting = issues.some((issue) => issue.type === 'conflict');
  const dateConflict = usableDates.size > 1;
  if (dateConflict) issues.push({ type: 'conflicting-observation-date', dates: [...usableDates] });

  const complete = missing.length === 0 && !conflicting && !dateConflict;
  const value = complete
    ? requiredUpstreams.reduce((total, name) => total + byUpstream.get(name).count, 0)
    : null;
  const observationDate = usableDates.size === 1 ? [...usableDates][0] : null;
  return { complete, value, observationDate, missing, issues, pulls: deduped };
}

export function selectSnapshot(snapshots, now = new Date()) {
  const suitable = (snapshots || [])
    .filter((snap) => {
      if (!snap || snap.complete !== true) return false;
      if (typeof snap.observationDate !== 'string' || !snap.observationDate) return false;
      if (typeof snap.value !== 'number' || !Number.isFinite(snap.value)) return false;
      if (!Array.isArray(snap.sources)) return false;
      if (!requiredUpstreams.every((name) => snap.sources.includes(name))) return false;
      const age = ageInDays(snap.observationDate, now);
      return age !== null && age >= 0 && age <= snapshotMaxAgeDays;
    })
    .sort((a, b) => b.observationDate.localeCompare(a.observationDate));
  return suitable[0] || null;
}

function freshnessOf(observationDate, now) {
  const age = observationDate === null ? null : ageInDays(observationDate, now);
  if (age === null) return { status: 'unknown', ageDays: null, maxAgeDays: snapshotMaxAgeDays };
  if (age === 0) return { status: 'fresh', ageDays: 0, maxAgeDays: snapshotMaxAgeDays };
  return { status: 'stale', ageDays: age, maxAgeDays: snapshotMaxAgeDays };
}

export function aggregateLiveAccounts(pulls, { snapshots = [], now = new Date() } = {}) {
  const live = evaluateLivePulls(pulls);
  if (live.complete) {
    // Complete pulls stay live even when the observation is old; the age is
    // surfaced as an explicit freshness warning instead of being hidden (C20).
    return {
      state: 'live',
      value: live.value,
      source: 'live',
      observedAt: now.toISOString(),
      observationDate: live.observationDate,
      freshness: freshnessOf(live.observationDate, now),
      snapshot: null,
      upstreams: live.pulls,
      issues: live.issues,
    };
  }

  const snapshot = selectSnapshot(snapshots, now);
  if (snapshot) {
    return {
      state: 'degraded',
      value: snapshot.value,
      source: 'snapshot',
      observedAt: snapshot.generatedAt ?? null,
      observationDate: snapshot.observationDate,
      freshness: freshnessOf(snapshot.observationDate, now),
      snapshot: {
        id: snapshot.id,
        observationDate: snapshot.observationDate,
        generatedAt: snapshot.generatedAt ?? null,
      },
      upstreams: live.pulls,
      issues: live.issues,
    };
  }

  return {
    state: 'unavailable',
    value: null,
    source: null,
    observedAt: null,
    observationDate: null,
    freshness: null,
    snapshot: null,
    upstreams: live.pulls,
    issues: [...live.issues, { type: 'no-suitable-snapshot' }],
  };
}
