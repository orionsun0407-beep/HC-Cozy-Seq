import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleBlastxQueries, sampleQueries, sampleTemplateDna, sampleTemplateProtein } from '../data/sampleData.ts';
import { runBlastpStyleComparison, runBlastxStyleComparison, runBlastxBatchComparisons } from './comparison.ts';
import { proteinToDna } from './translation.ts';
import { buildFormattedPlainText } from './copy.ts';
import { createHistoryEntry } from './history.ts';
import { buildMutationTableRows } from './excelExport.ts';

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

test('BLASTX fixes the template target across queries and rejects matching vector ORFs', () => {
  const vectorProtein = 'MWWWWWWWWWWWWWWWWWWWW';
  const template = { name: 'Target with vector', sequence: `${sampleTemplateDna}TAA${proteinToDna(vectorProtein)}TAA` };
  const [target, vectorOnly] = runBlastxBatchComparisons(template, [
    { name: 'Target', sequence: sampleTemplateDna },
    { name: 'Vector only', sequence: `${proteinToDna(vectorProtein)}TAA` },
  ], 'DNA');

  assert.equal(target.status, 'matched');
  assert.equal(target.templateProteinUsed, sampleTemplateProtein);
  assert.equal(target.alignment.templateCoverage, 1);
  assert.equal(vectorOnly.templateProteinUsed, sampleTemplateProtein);
  assert.equal(vectorOnly.status, 'unreliable');
  assert.equal(vectorOnly.alignment.templateCoverage, 0);
  assert.deepEqual(vectorOnly.mutations, []);
  assert.doesNotMatch(vectorOnly.mutationSummary, /No mutation/);
});

test('BLASTX retains a supported target when a plasmid has a longer unrelated ORF', () => {
  const unrelated = 'M' + 'W'.repeat(sampleTemplateProtein.length + 30);
  const template = { name: 'Plasmid', sequence: `${proteinToDna(unrelated)}TAA${sampleTemplateDna}TAA` };
  const result = runBlastxStyleComparison(template, { name: 'Target', sequence: sampleTemplateDna }, 'DNA');
  assert.equal(result.status, 'matched');
  assert.equal(result.templateProteinUsed, sampleTemplateProtein);
  assert.equal(result.alignment.templateCoverage, 1);
});

test('BLASTX rejects a Met-only match and preserves the failure in copy, history and Excel', () => {
  const result = runBlastxStyleComparison(
    { name: 'Protein target', sequence: sampleTemplateProtein },
    { name: 'SGA1-like empty insert', sequence: 'ATGTAA' },
    'Protein',
  );
  assert.equal(result.status, 'unreliable');
  assert.equal(result.templateProteinUsed.length, sampleTemplateProtein.length);
  assert.equal(result.alignment.score, 0);
  assert.equal(result.queryProteinUsed, '');
  assert.match(result.mutationSummary, /无法判断突变/);
  assert.doesNotMatch(buildFormattedPlainText(result), /No mutation/);
  assert.match(buildMutationTableRows([result], [])[0].noMutationLabel ?? '', /无法判断突变/);
  const entry = createHistoryEntry({
    mode: 'BLASTX', templateType: 'Protein',
    template: { id: 'template', name: 'Protein target', sequence: sampleTemplateProtein },
    queries: [{ id: 'q', name: result.queryName, sequence: 'ATGTAA' }],
    colorRules: [], results: [result],
  });
  assert.equal(entry.templateLength, sampleTemplateProtein.length);
  assert.equal(entry.summaries[0].templateCoverage, 0);
  assert.match(entry.summaries[0].mutationSummary, /无法判断突变/);
});
