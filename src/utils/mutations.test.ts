import test from 'node:test';
import assert from 'node:assert/strict';
import type { AlignmentResult } from '../types.ts';
import { runBlastpStyleComparison } from './comparison.ts';
import { extractMutations, formatMutationSummary } from './mutations.ts';

const baseAlignment: AlignmentResult = {
  alignedTemplate: 'MKI',
  alignedQuery: 'MVI',
  templateStart: 0,
  templateEnd: 3,
  queryStart: 0,
  queryEnd: 3,
  score: 5,
  matches: 2,
  mismatches: 1,
  gaps: 0,
  alignedResidues: 3,
  templateCoverage: 1,
  queryCoverage: 1,
};

test('extractMutations maps substitutions to template amino-acid numbering', () => {
  const mutations = extractMutations(baseAlignment);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].event, 'K2V');
  assert.equal(mutations[0].templatePosition, 2);
  assert.equal(mutations[0].queryPosition, 2);
});

test('formatMutationSummary sorts and joins without spaces', () => {
  const mutations = extractMutations({
    ...baseAlignment,
    alignedTemplate: 'MKDI',
    alignedQuery: 'MVRG',
    templateEnd: 4,
    queryEnd: 4,
  });

  assert.equal(formatMutationSummary('F3', mutations), 'F3-K2V,D3R,I4G');
  assert.equal(formatMutationSummary('F2', []), 'F2-No mutation');
});

test('extractMutations groups contiguous template deletions', () => {
  const mutations = extractMutations({
    ...baseAlignment,
    alignedTemplate: 'MKDIE',
    alignedQuery: 'M--IE',
    templateEnd: 5,
    queryEnd: 3,
    gaps: 2,
  });

  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].event, 'Δ2-3del');
  assert.equal(mutations[0].templatePosition, 2);
  assert.equal(mutations[0].templateEndPosition, 3);
  assert.equal(formatMutationSummary('F4', mutations), 'F4-Δ2-3del');
});

test('extractMutations reports single-residue template deletions', () => {
  const mutations = extractMutations({
    ...baseAlignment,
    alignedTemplate: 'MKI',
    alignedQuery: 'M-I',
    queryEnd: 2,
    gaps: 1,
  });

  assert.equal(mutations[0].event, 'K2del');
});

test('extractMutations groups query insertions relative to the template', () => {
  const mutations = extractMutations({
    ...baseAlignment,
    alignedTemplate: 'MK--I',
    alignedQuery: 'MKAAI',
    templateEnd: 3,
    queryEnd: 5,
    gaps: 2,
  });

  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].event, 'K2insAA');
  assert.equal(mutations[0].from, '-');
  assert.equal(mutations[0].to, 'AA');
  assert.equal(mutations[0].templatePosition, 2);
  assert.equal(mutations[0].queryPosition, 3);
  assert.equal(mutations[0].queryEndPosition, 4);
  assert.equal(formatMutationSummary('F5', mutations), 'F5-K2insAA');
});

test('extractMutations reports query terminal insertions outside the local window', () => {
  const nTerminal = extractMutations(
    {
      ...baseAlignment,
      alignedTemplate: 'MKI',
      alignedQuery: 'MKI',
      templateStart: 0,
      templateEnd: 3,
      queryStart: 2,
      queryEnd: 5,
      queryCoverage: 3 / 5,
    },
    'MKI',
    'AAMKI',
  );
  const cTerminal = extractMutations(
    {
      ...baseAlignment,
      alignedTemplate: 'MKI',
      alignedQuery: 'MKI',
      templateStart: 0,
      templateEnd: 3,
      queryStart: 0,
      queryEnd: 3,
      queryCoverage: 3 / 5,
    },
    'MKI',
    'MKIAA',
  );

  assert.equal(nTerminal[0].event, 'N-term-insAA');
  assert.equal(cTerminal[0].event, 'I3insAA');
});

test('runBlastpStyleComparison calls sample-style mutation names', () => {
  const result = runBlastpStyleComparison(
    { name: 'Template', sequence: 'MKI' },
    { name: 'F2', sequence: 'MVI' },
  );

  assert.equal(result.mutationSummary, 'F2-K2V');
});
