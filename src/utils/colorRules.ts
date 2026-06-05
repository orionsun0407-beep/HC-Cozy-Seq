import type { ColorRule, Mutation, PrismColorName } from '../types';

export interface PrismColor {
  name: PrismColorName;
  background: string;
  border: string;
  text: string;
}

export const PRISM_COLORS: Record<PrismColorName, PrismColor> = {
  Blue: { name: 'Blue', background: '#cfe6ff', border: '#8abde8', text: '#17456f' },
  Red: { name: 'Red', background: '#ffd4dc', border: '#ee9cad', text: '#7a2434' },
  Yellow: { name: 'Yellow', background: '#fff0b8', border: '#dec870', text: '#624f09' },
  Green: { name: 'Green', background: '#d8f1d2', border: '#9acb91', text: '#255822' },
  Purple: { name: 'Purple', background: '#eadcff', border: '#bea3e7', text: '#4d3278' },
  Orange: { name: 'Orange', background: '#ffe0c4', border: '#e7ae77', text: '#74410d' },
  Pink: { name: 'Pink', background: '#ffd8ee', border: '#e9a0c8', text: '#783058' },
  Teal: { name: 'Teal', background: '#cef0ec', border: '#86c9c2', text: '#175b56' },
  Gray: { name: 'Gray', background: '#e8ece8', border: '#bdc7bf', text: '#3f4b44' },
};

export const DEFAULT_COLOR_RULES: ColorRule[] = [
  { id: 'rule-blue-default', start: 1, end: 148, color: 'Blue' },
  { id: 'rule-red-default', start: 149, end: 303, color: 'Red' },
  { id: 'rule-yellow-default', start: 304, end: null, color: 'Yellow' },
];

export function applyMutationColorRules(position: number, rules: ColorRule[]): PrismColor {
  const match = rules.find((rule) => {
    const start = Number.isFinite(rule.start) ? rule.start : 1;
    const end = rule.end === null || !Number.isFinite(rule.end) ? Infinity : rule.end;
    return position >= start && position <= end;
  });

  return PRISM_COLORS[match?.color ?? 'Gray'];
}

export function colorForMutation(mutation: Mutation, rules: ColorRule[]): PrismColor {
  return applyMutationColorRules(mutation.templatePosition, rules);
}

export function allPrismColorNames(): PrismColorName[] {
  return Object.keys(PRISM_COLORS) as PrismColorName[];
}
