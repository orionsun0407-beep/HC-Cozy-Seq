import test from 'node:test';
import assert from 'node:assert/strict';
import type { ComparisonResult } from '../types.ts';
import { DEFAULT_COLOR_RULES } from './colorRules.ts';
import { buildFormattedHtml, buildFormattedPlainText } from './copy.ts';

const result: ComparisonResult = {
  id: 'copy-test',
  mode: 'BLASTP',
  templateName: 'Template',
  queryName: 'F2',
  templateProteinUsed: 'MKI',
  queryProteinUsed: 'MVI',
  alignment: {
    alignedTemplate: 'MKI',
    alignedQuery: 'MVI',
    templateStart: 0,
    templateEnd: 3,
    queryStart: 0,
    queryEnd: 3,
    score: 10,
    matches: 2,
    mismatches: 1,
    gaps: 0,
    alignedResidues: 3,
    templateCoverage: 1,
    queryCoverage: 1,
  },
  mutations: [
    {
      from: 'K',
      to: 'V',
      templatePosition: 2,
      queryPosition: 2,
      alignmentColumn: 1,
      event: 'K2V',
    },
  ],
  mutationSummary: 'F2-K2V',
  metadata: {
    mode: 'BLASTP',
    templateType: 'Protein',
    detectedTemplateType: 'protein',
    alignmentScore: 10,
    templateCoverage: 1,
    queryCoverage: 1,
    matches: 2,
    mismatches: 1,
    gaps: 0,
    debug: [],
  },
  warnings: [],
};

test('buildFormattedPlainText uses compact header and unwrapped sequence body', () => {
  assert.equal(buildFormattedPlainText(result), '>F2-K2V\nMVI');
});

test('buildFormattedHtml uses literal colors and no wrapped sequence body', () => {
  const html = buildFormattedHtml(result, DEFAULT_COLOR_RULES);

  assert.match(html, /&gt;F2-/);
  assert.match(html, /#cfe6ff/);
  assert.doesNotMatch(html, /Template vs F2/);
  assert.doesNotMatch(html, /M\nVI/);
});
