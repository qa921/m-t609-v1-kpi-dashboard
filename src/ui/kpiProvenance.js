// Shared provenance rendering for the Active Accounts KPI (KAN-212).
// Source, observation date, and staleness are always emitted as visible text
// beside the number so degraded or stale data can never pass as live in
// either UI surface.

const STATE_LABELS = { live: 'Live', degraded: 'Degraded', unavailable: 'Unavailable' };

export function stateLabel(model) {
  return STATE_LABELS[model?.state] ?? 'Unavailable';
}

export function freshnessText(model) {
  const freshness = model?.freshness;
  if (!freshness || freshness.status == null || freshness.status === 'unknown') {
    return 'freshness unknown';
  }
  if (freshness.status === 'fresh') return 'observed today';
  const days = freshness.ageDays;
  return `stale — observed ${days} day${days === 1 ? '' : 's'} ago (policy max ${freshness.maxAgeDays})`;
}

export function provenanceText(model) {
  if (model?.state === 'degraded' && model.snapshot) {
    return `Snapshot: ${model.snapshot.id} · observation date ${model.snapshot.observationDate} · ${freshnessText(model)}`;
  }
  if (model?.state === 'live') {
    const date = model.observationDate ? ` · observation date ${model.observationDate}` : '';
    return `Live pull${date} · ${freshnessText(model)}`;
  }
  return 'Unavailable — no complete live pull and no suitable snapshot';
}
