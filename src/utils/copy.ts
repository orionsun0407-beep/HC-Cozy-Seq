import type { ColorRule, ComparisonResult, Mutation } from '../types';
import { colorForMutation } from './colorRules.ts';
import { mutationMapByQueryPosition } from './mutations.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function coloredHeader(result: ComparisonResult, rules: ColorRule[]): string {
  if (!result.mutations.length) {
    return `&gt;${escapeHtml(result.mutationSummary)}`;
  }

  const prefix = `${result.queryName || 'Query'}-`;
  const events = result.mutations
    .map((mutation: Mutation) => {
      const color = colorForMutation(mutation, rules);
      return `<span style="background:${color.background};color:${color.text};border:1px solid ${color.border};padding:1px 4px;border-radius:4px;">${escapeHtml(
        mutation.event,
      )}</span>`;
    })
    .join(',');

  return `&gt;${escapeHtml(prefix)}${events}`;
}

function coloredSequenceBody(result: ComparisonResult, rules: ColorRule[]): string {
  const mutationByQueryPosition = mutationMapByQueryPosition(result.mutations);
  const chunks: string[] = [];

  for (let index = 0; index < result.queryProteinUsed.length; index += 1) {
    const mutation = mutationByQueryPosition.get(index + 1);
    const residue = escapeHtml(result.queryProteinUsed[index]);
    if (!mutation) {
      chunks.push(residue);
      continue;
    }
    const color = colorForMutation(mutation, rules);
    chunks.push(`<span style="background:${color.background};color:${color.text};">${residue}</span>`);
  }

  return chunks.join('');
}

export function buildFormattedPlainText(result: ComparisonResult): string {
  return `>${result.mutationSummary}\n${result.queryProteinUsed}`;
}

export function buildFormattedHtml(result: ComparisonResult, rules: ColorRule[]): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#24312a;">
<div style="font-weight:700;margin-bottom:8px;">${coloredHeader(result, rules)}</div>
<pre style="font-family:SFMono-Regular,Consolas,'Liberation Mono',monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;background:#ffffff;color:#24312a;">${coloredSequenceBody(
    result,
    rules,
  )}</pre>
</div>`;
}

export async function copyFormattedResult(result: ComparisonResult, rules: ColorRule[]): Promise<void> {
  const plain = buildFormattedPlainText(result);
  const html = buildFormattedHtml(result, rules);

  if ('clipboard' in navigator && 'ClipboardItem' in window && navigator.clipboard.write) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return;
  }

  await navigator.clipboard.writeText(plain);
}
