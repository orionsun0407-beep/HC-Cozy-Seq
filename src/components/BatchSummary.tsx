import type { BatchStatistics, ColorRule } from '../types';
import { MutationChip } from './MutationChip';

interface BatchSummaryProps {
  stats: BatchStatistics | null;
  rules: ColorRule[];
}

export function BatchSummary({ stats, rules }: BatchSummaryProps) {
  if (!stats) {
    return (
      <section className="card summary-card" aria-labelledby="summary-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Batch view</p>
            <h2 id="summary-title">Mutation Statistics / Batch Summary</h2>
          </div>
        </div>
        <p className="empty-note">Run a comparison to see batch-level mutation patterns.</p>
      </section>
    );
  }

  return (
    <section className="card summary-card" aria-labelledby="summary-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Batch view</p>
          <h2 id="summary-title">Mutation Statistics / Batch Summary</h2>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <span>Total queries</span>
          <strong>{stats.totalQueries}</strong>
        </div>
        <div className="metric">
          <span>Mutated queries</span>
          <strong>{stats.mutatedQueries}</strong>
        </div>
        <div className="metric">
          <span>Total mutations</span>
          <strong>{stats.totalMutations}</strong>
        </div>
      </div>

      <div className="summary-columns">
        <div>
          <h3>Frequently mutated positions</h3>
          <div className="chip-list">
            {stats.frequentPositions.length ? (
              stats.frequentPositions.slice(0, 12).map((item) => (
                <MutationChip
                  key={item.position}
                  label={`${item.position} × ${item.count}`}
                  position={item.position}
                  rules={rules}
                  title={item.queryNames.join(', ')}
                />
              ))
            ) : (
              <span className="muted-text">No mutated positions yet.</span>
            )}
          </div>
          {stats.frequentPositions.length > 0 && (
            <div className="support-list" aria-label="Query support by frequent position">
              {stats.frequentPositions.slice(0, 6).map((item) => (
                <p key={`support-${item.position}`}>
                  <strong>{item.position}</strong>: {item.queryNames.join(', ')}
                </p>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3>Frequently observed mutation events</h3>
          <div className="chip-list">
            {stats.frequentEvents.length ? (
              stats.frequentEvents.slice(0, 12).map((item) => (
                <MutationChip key={item.event} label={`${item.event} × ${item.count}`} position={item.position} rules={rules} />
              ))
            ) : (
              <span className="muted-text">No mutation events yet.</span>
            )}
          </div>
        </div>
      </div>

      <div className="findings">
        <h3>Key Findings</h3>
        <div className="summary-columns">
          <div>
            <p className="small-label">Repeated positions</p>
            <div className="chip-list">
              {stats.repeatedPositions.length ? (
                stats.repeatedPositions.map((item) => (
                  <MutationChip
                    key={item.position}
                    label={`${item.position} in ${item.count} queries`}
                    position={item.position}
                    rules={rules}
                    title={item.queryNames.join(', ')}
                  />
                ))
              ) : (
                <span className="muted-text">None repeated across at least 2 queries.</span>
              )}
            </div>
          </div>
          <div>
            <p className="small-label">Repeated exact mutations</p>
            <div className="chip-list">
              {stats.repeatedEvents.length ? (
                stats.repeatedEvents.map((item) => (
                  <MutationChip
                    key={item.event}
                    label={`${item.event} in ${item.count} queries`}
                    position={item.position}
                    rules={rules}
                    title={item.queryNames.join(', ')}
                  />
                ))
              ) : (
                <span className="muted-text">None repeated across at least 2 queries.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
