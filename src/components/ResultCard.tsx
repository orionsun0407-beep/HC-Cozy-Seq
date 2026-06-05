import { useMemo, useState } from 'react';
import type { ColorRule, ComparisonResult } from '../types';
import { copyFormattedResult } from '../utils/copy';
import { mutationMapByAlignmentColumn, mutationMapByQueryPosition, mutationMapByTemplatePosition } from '../utils/mutations';
import { MutationChip } from './MutationChip';
import { SequenceViewer } from './SequenceViewer';

interface ResultCardProps {
  result: ComparisonResult;
  rules: ColorRule[];
  onCopyStatus: (message: string, ok?: boolean) => void;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ResultCard({ result, rules, onCopyStatus }: ResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const mutationByQuery = useMemo(() => mutationMapByQueryPosition(result.mutations), [result.mutations]);
  const mutationByTemplate = useMemo(() => mutationMapByTemplatePosition(result.mutations), [result.mutations]);
  const mutationByColumn = useMemo(() => mutationMapByAlignmentColumn(result.mutations), [result.mutations]);
  const deletions = useMemo(() => result.mutations.filter((mutation) => mutation.to === '-'), [result.mutations]);
  const insertions = useMemo(() => result.mutations.filter((mutation) => mutation.from === '-'), [result.mutations]);

  const handleCopy = async () => {
    try {
      await copyFormattedResult(result, rules);
      onCopyStatus(`Copied ${result.queryName} formatted sequence.`, true);
    } catch {
      onCopyStatus('Copy failed. Browser clipboard permission may be blocked.', false);
    }
  };

  return (
    <article className="card result-card">
      <div className="result-topline">
        <div>
          <p className="eyebrow">{result.mode}</p>
          <h3>
            {result.templateName} vs {result.queryName}
          </h3>
        </div>
        <div className="result-actions">
          <button className="button button--small" type="button" onClick={handleCopy}>
            Copy formatted
          </button>
          <button className="button button--ghost button--small" type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>

      <div className="chip-list">
        {result.mutations.length ? (
          result.mutations.map((mutation) => <MutationChip key={mutation.event} mutation={mutation} label={mutation.event} rules={rules} />)
        ) : (
          <span className="mutation-chip mutation-chip--neutral">No mutation</span>
        )}
      </div>

      {result.warnings.length > 0 && (
        <div className="inline-warning">
          {result.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      {deletions.length > 0 && (
        <div className="deletion-note">
          <p className="small-label">Missing template residues</p>
          <div className="chip-list">
            {deletions.map((deletion) => (
              <MutationChip key={`missing-${deletion.event}`} mutation={deletion} label={deletion.event} rules={rules} />
            ))}
          </div>
        </div>
      )}

      {insertions.length > 0 && (
        <div className="insertion-note">
          <p className="small-label">Extra query residues</p>
          <div className="chip-list">
            {insertions.map((insertion) => (
              <MutationChip key={`extra-${insertion.event}`} mutation={insertion} label={insertion.event} rules={rules} />
            ))}
          </div>
        </div>
      )}

      <SequenceViewer
        label="TRANSLATED PROTEIN USED FOR MUTATION CALLING"
        sequence={result.queryProteinUsed}
        mutationByIndex={mutationByQuery}
        rules={rules}
        compact
      />

      {expanded && (
        <div className="details">
          <div className="badge-row" aria-label="Alignment metadata">
            <span>{result.metadata.mode}</span>
            <span>Template: {result.metadata.templateType}</span>
            <span>Detected: {result.metadata.detectedTemplateType}</span>
            {result.metadata.templateFrame && <span>Template frame: {result.metadata.templateFrame}</span>}
            {result.metadata.queryFrame && <span>Query frame: {result.metadata.queryFrame}</span>}
            {result.metadata.templateOrfLength !== undefined && <span>Template ORF: {result.metadata.templateOrfLength} aa</span>}
            {result.metadata.queryOrfLength !== undefined && <span>Query ORF: {result.metadata.queryOrfLength} aa</span>}
            <span>Score: {result.metadata.alignmentScore}</span>
            <span>Template coverage: {percent(result.metadata.templateCoverage)}</span>
          </div>

          <div className="metrics-grid">
            <div>
              <span>Query coverage</span>
              <strong>{percent(result.metadata.queryCoverage)}</strong>
            </div>
            <div>
              <span>Matches</span>
              <strong>{result.metadata.matches}</strong>
            </div>
            <div>
              <span>Mismatches</span>
              <strong>{result.metadata.mismatches}</strong>
            </div>
            <div>
              <span>Gaps</span>
              <strong>{result.metadata.gaps}</strong>
            </div>
          </div>

          <SequenceViewer
            label="ALIGNED TEMPLATE WINDOW"
            sequence={result.alignment.alignedTemplate}
            mutationByIndex={mutationByColumn}
            indexBase={0}
            rules={rules}
          />
          <SequenceViewer
            label="TRANSLATED TEMPLATE PROTEIN USED FOR ALIGNMENT"
            sequence={result.templateProteinUsed}
            mutationByIndex={mutationByTemplate}
            rules={rules}
          />
          <SequenceViewer
            label="ALIGNED TRANSLATED QUERY WINDOW"
            sequence={result.alignment.alignedQuery}
            mutationByIndex={mutationByColumn}
            indexBase={0}
            rules={rules}
          />

          <div className="debug-box">
            <p className="small-label">Debug details</p>
            {result.metadata.debug.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
