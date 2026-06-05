import type { ColorRule, Mutation } from '../types';
import { colorForMutation } from '../utils/colorRules';

interface SequenceViewerProps {
  sequence: string;
  label: string;
  mutationByIndex?: Map<number, Mutation>;
  indexBase?: number;
  emptyText?: string;
  compact?: boolean;
  ariaLabel?: string;
}

interface ColoredSequenceViewerProps extends SequenceViewerProps {
  rules: ColorRule[];
}

export function SequenceViewer({
  sequence,
  label,
  mutationByIndex,
  indexBase = 1,
  emptyText = 'No sequence available.',
  compact = false,
  ariaLabel,
  rules,
}: ColoredSequenceViewerProps) {
  return (
    <div className={compact ? 'sequence-viewer sequence-viewer--compact' : 'sequence-viewer'}>
      <p className="small-label">{label}</p>
      {sequence ? (
        <pre aria-label={ariaLabel ?? label}>
          {[...sequence].map((char, index) => {
            const mutation = mutationByIndex?.get(index + indexBase);
            if (!mutation) return <span key={`${char}-${index}`}>{char}</span>;
            const color = colorForMutation(mutation, rules);
            return (
              <span
                className="residue-highlight"
                key={`${char}-${index}`}
                style={{ backgroundColor: color.background, color: color.text }}
                title={mutation.event}
              >
                {char}
              </span>
            );
          })}
        </pre>
      ) : (
        <p className="empty-note">{emptyText}</p>
      )}
    </div>
  );
}
