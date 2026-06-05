import type { Mode } from '../types';

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="mode-toggle" role="group" aria-label="Comparison mode">
      {(['BLASTP', 'BLASTX'] as const).map((item) => (
        <button
          key={item}
          className={mode === item ? 'segment segment--active' : 'segment'}
          type="button"
          aria-pressed={mode === item}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
