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
