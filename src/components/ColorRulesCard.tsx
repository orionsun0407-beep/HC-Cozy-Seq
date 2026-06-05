import type { ColorRule, PrismColorName } from '../types';
import { allPrismColorNames } from '../utils/colorRules';

interface ColorRulesCardProps {
  rules: ColorRule[];
  onChange: (rules: ColorRule[]) => void;
}

export function ColorRulesCard({ rules, onChange }: ColorRulesCardProps) {
  const colors = allPrismColorNames();

  const updateRule = (id: string, patch: Partial<ColorRule>) => {
    onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const addRule = () => {
    onChange([...rules, { id: crypto.randomUUID(), start: 1, end: null, color: 'Gray' }]);
  };

  const removeRule = (id: string) => {
    onChange(rules.filter((rule) => rule.id !== id));
  };

  return (
    <section className="card color-card" aria-labelledby="color-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Highlighting</p>
          <h2 id="color-title">Mutation Color Rules</h2>
        </div>
        <button className="button button--small" type="button" onClick={addRule}>
          Add rule
        </button>
      </div>

      <div className="rule-table" role="group" aria-label="Mutation color rules">
        {rules.map((rule, index) => (
          <div className="rule-row" key={rule.id}>
            <label className="field">
              <span>Start</span>
              <input
                type="number"
                min={1}
                value={rule.start}
                onChange={(event) => updateRule(rule.id, { start: Number(event.target.value) || 1 })}
              />
            </label>
            <label className="field">
              <span>End</span>
              <input
                type="number"
                min={1}
                value={rule.end ?? ''}
                placeholder="304+"
                onChange={(event) =>
                  updateRule(rule.id, { end: event.target.value ? Number(event.target.value) || null : null })
                }
              />
            </label>
            <label className="field field--color">
              <span>Color</span>
              <div className="select-with-swatch">
                <select value={rule.color} onChange={(event) => updateRule(rule.id, { color: event.target.value as PrismColorName })}>
                  {colors.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
                <span className={`field-swatch swatch--${rule.color.toLowerCase()}`} aria-hidden="true" />
              </div>
            </label>
            <button className="icon-button" type="button" onClick={() => removeRule(rule.id)} aria-label={`Remove rule ${index + 1}`}>
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
