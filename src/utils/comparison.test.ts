import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleBlastxQueries, sampleQueries, sampleTemplateDna, sampleTemplateProtein } from '../data/sampleData.ts';
import { runBlastpStyleComparison, runBlastxStyleComparison } from './comparison.ts';

test('sample BLASTP mutations use template residue numbering', () => {
  const template = { name: 'Template', sequence: sampleTemplateProtein };
  const f2 = runBlastpStyleComparison(template, { name: sampleQueries[0].name, sequence: sampleQueries[0].sequence });
  const f3 = runBlastpStyleComparison(template, { name: sampleQueries[1].name, sequence: sampleQueries[1].sequence });

  assert.equal(f2.mutationSummary, 'F2-K150R');
  assert.equal(f3.mutationSummary, 'F3-I125V,D188G');
});

test('sample BLASTX mutations use translated template numbering', () => {
  const template = { name: 'Template CDS', sequence: sampleTemplateDna };
  const f3 = runBlastxStyleComparison(template, { name: sampleBlastxQueries[1].name, sequence: sampleBlastxQueries[1].sequence }, 'DNA');

  assert.equal(f3.mutationSummary, 'F3-I125V,D188G');
  assert.equal(f3.metadata.templateFrame, '+1');
  assert.equal(f3.metadata.queryFrame, '+1');
});
