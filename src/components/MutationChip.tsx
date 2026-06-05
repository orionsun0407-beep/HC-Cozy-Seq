import type { ColorRule, Mutation } from '../types';
import { applyMutationColorRules, colorForMutation } from '../utils/colorRules';

interface MutationChipProps {
  mutation?: Mutation;
  label: string;
  position?: number;
  rules: ColorRule[];
  title?: string;
}

export function MutationChip({ mutation, label, position, rules, title }: MutationChipProps) {
  const color = mutation ? colorForMutation(mutation, rules) : applyMutationColorRules(position ?? 0, rules);

  return (
    <span
      className="mutation-chip"
      title={title}
      style={{
        backgroundColor: color.background,
        borderColor: color.border,
        color: color.text,
      }}
    >
      {label}
    </span>
  );
}
