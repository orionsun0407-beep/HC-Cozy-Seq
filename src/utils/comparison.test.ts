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
  assert.equal(f3.templateProteinUsed.startsWith('M'), true);
  assert.equal(f3.queryProteinUsed.startsWith('M'), true);
  assert.equal(f3.alignment.templateStart, 0);
  assert.equal(f3.alignment.queryStart, 0);
});

test('BLASTX accepts an amino-acid template with a DNA query', () => {
  const template = { name: 'Protein template', sequence: sampleTemplateProtein };
  const f3 = runBlastxStyleComparison(
    template,
    { name: sampleBlastxQueries[1].name, sequence: sampleBlastxQueries[1].sequence },
    'Protein',
  );

  assert.equal(f3.mutationSummary, 'F3-I125V,D188G');
  assert.equal(f3.metadata.templateType, 'Protein');
  assert.equal(f3.metadata.templateFrame, 'protein');
  assert.equal(f3.metadata.queryFrame, '+1');
  assert.equal(f3.templateProteinUsed, sampleTemplateProtein);
  assert.equal(f3.alignment.templateStart, 0);
  assert.equal(f3.alignment.queryStart, 0);
});

test('BLASTX requires both translated ORFs to start with Met', () => {
  const template = { name: 'Template CDS', sequence: 'ATGGCTGCTGCTTAA' };
  const queryWithoutMet = { name: 'Partial query', sequence: 'GCTGCTGCTTAA' };
  const result = runBlastxStyleComparison(template, queryWithoutMet, 'DNA');

  assert.equal(result.alignment.score, 0);
  assert.match(result.warnings[0], /M（Met）/);
});

test('BLASTX rejects a local match that trims either leading Met', () => {
  const templateProtein = { name: 'Template protein', sequence: 'MAAAA' };
  const queryDna = { name: 'Query CDS', sequence: 'ATGCGTCGTCGTGCTGCTGCTGCTTAA' };
  const result = runBlastxStyleComparison(templateProtein, queryDna, 'Protein');

  assert.equal(result.alignment.score, 0);
  assert.match(result.warnings[0], /双方首个 M/);
});
