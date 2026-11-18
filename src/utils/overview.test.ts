import test from 'node:test';
import assert from 'node:assert/strict';
import type { ComparisonResult } from '../types.ts';
import { DEFAULT_COLOR_RULES } from './colorRules.ts';
import { buildOverviewModel } from './overview.ts';

function makeResult(id: string, queryName: string, mutations: ComparisonResult['mutations']): ComparisonResult {
  return {
    id,
    mode: 'BLASTP',
    templateName: 'Template',
    queryName,
    templateProteinUsed: 'MKDIE',
    queryProteinUsed: 'MKDIE',
    alignment: {
      alignedTemplate: 'MKDIE',
      alignedQuery: 'MKDIE',
      templateStart: 0,
      templateEnd: 5,
      queryStart: 0,
      queryEnd: 5,
      score: 12,
      matches: 5,
      mismatches: 0,
      gaps: 0,
      alignedResidues: 5,
      templateCoverage: 1,
      queryCoverage: 1,
    },
    mutations,
    mutationSummary: `${queryName}-${mutations.map((mutation) => mutation.event).join(',') || 'No mutation'}`,
    metadata: {
      mode: 'BLASTP',
      templateType: 'Protein',
      detectedTemplateType: 'protein',
      alignmentScore: 12,
      templateCoverage: 1,
      queryCoverage: 1,
      matches: 5,
      mismatches: 0,
      gaps: 0,
      debug: [],
    },
    warnings: [],
  };
}

test('buildOverviewModel counts substitutions, deletions, and insertions on the template axis', () => {
  const results = [
    makeResult('r1', 'F2', [
      { from: 'K', to: 'V', templatePosition: 2, queryPosition: 2, alignmentColumn: 1, event: 'K2V' },
    ]),
    makeResult('r2', 'F3', [
      {
        from: 'DI',
        to: '-',
        templatePosition: 3,
        templateEndPosition: 4,
        queryPosition: 3,
        alignmentColumn: 2,
        alignmentEndColumn: 3,
        event: 'Δ3-4del',
      },
      {
        from: '-',
        to: 'AA',
        templatePosition: 2,
        queryPosition: 3,
        queryEndPosition: 4,
        alignmentColumn: 2,
        alignmentEndColumn: 3,
        event: 'K2insAA',
      },
    ]),
  ];

  const model = buildOverviewModel(results, DEFAULT_COLOR_RULES);

  assert.ok(model);
  assert.equal(model?.templateLength, 5);
  assert.equal(model?.positionCounts[1], 2);
  assert.equal(model?.positionCounts[2], 1);
  assert.equal(model?.positionCounts[3], 1);
  assert.equal(model?.rows[1].marks[0].kind, 'deletion');
  assert.equal(model?.rows[1].marks[1].kind, 'insertion');
});

test('no-mutation overview includes a short template and every query for image export', () => {
  const model = buildOverviewModel([
    makeResult('r1', 'E2-032', []),
    makeResult('r2', 'E2-031', []),
  ], DEFAULT_COLOR_RULES);

  assert.ok(model);
  assert.equal(model.focusWindows.length, 1);
  const window = model.focusWindows[0];
  assert.equal(window.start, 1);
  assert.equal(window.end, 5);
  assert.deepEqual(window.rows.map((row) => row.label), ['Template', 'E2-032', 'E2-031']);
  for (const row of window.rows) {
    assert.equal(row.cells.map((cell) => cell.char).join(''), 'MKDIE');
    assert.ok(row.cells.every((cell) => cell.mutation === null && cell.color === null));
  }
  assert.equal(window.rows[1].note, 'No mutation · 100% coverage');
});

test('no-mutation overview displays at most 40 residues, using the first and last 20 with original positions', () => {
  for (const length of [40, 41, 330]) {
    const result = makeResult('same', 'No mutation sample', []);
    const sequence = `M${'K'.repeat(length - 2)}E`;
    result.templateProteinUsed = sequence;
    result.queryProteinUsed = sequence;
    result.alignment = { ...result.alignment, alignedTemplate: sequence, alignedQuery: sequence, templateEnd: length, queryEnd: length };
    const model = buildOverviewModel([result], DEFAULT_COLOR_RULES);

    assert.ok(model);
    assert.equal(model.templateLength, length);
    assert.deepEqual(model.focusWindows.map(({ start, end }) => [start, end]),
      length === 40 ? [[1, 40]] : [[1, 20], [length - 19, length]]);
    const cells = model.focusWindows.flatMap((window) => window.rows[1].cells);
    assert.equal(cells.length, 40);
    assert.equal(new Set(cells.map((cell) => cell.position)).size, 40);
    assert.equal(cells[0].char, 'M');
    assert.equal(cells.at(-1)?.char, 'E');
    assert.ok(cells.every((cell) => cell.char === sequence[cell.position - 1]));
  }
});

test('no-mutation overview does not fill uncovered or unreliable positions with template residues', () => {
  const partial = makeResult('partial', 'Partial query', []);
  partial.alignment = { ...partial.alignment, alignedTemplate: 'MKD', alignedQuery: 'MKD', templateEnd: 3, queryEnd: 3, templateCoverage: 0.6 };
  partial.metadata.templateCoverage = 0.6;
  const unreliable = { ...makeResult('failed', 'Failed query', []), status: 'unreliable' as const };
  const model = buildOverviewModel([partial, unreliable], DEFAULT_COLOR_RULES);

  assert.ok(model);
  const rows = model.focusWindows[0].rows;
  assert.equal(rows[1].cells.map((cell) => cell.char).join(''), 'MKD··');
  assert.equal(rows[1].note, 'No mutation · 60% coverage');
  assert.equal(rows[2].cells.map((cell) => cell.char).join(''), '·····');
  assert.equal(rows[2].note, 'Unable to determine mutations');
});
