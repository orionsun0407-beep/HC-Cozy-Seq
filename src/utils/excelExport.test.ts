import assert from 'node:assert/strict';
import test from 'node:test';
import type { ColorRule, ComparisonResult, Mutation } from '../types.ts';
import { buildMutationTableRows } from './excelExport.ts';

function mutation(event: string, templatePosition: number, alignmentColumn: number): Mutation {
  return {
    from: event.includes('ins') ? '-' : event[0],
    to: event.endsWith('del') ? '-' : event.at(-1) ?? '',
    templatePosition,
    queryPosition: templatePosition,
    alignmentColumn,
    event,
  };
}

function result(queryName: string, mutations: Mutation[]): ComparisonResult {
  return {
    id: queryName,
    mode: 'BLASTX',
    templateName: 'Template',
    queryName,
    templateProteinUsed: '',
    queryProteinUsed: '',
    alignment: {
      alignedTemplate: '',
      alignedQuery: '',
      templateStart: 0,
      templateEnd: 0,
      queryStart: 0,
      queryEnd: 0,
      score: 0,
      matches: 0,
      mismatches: 0,
      gaps: 0,
      alignedResidues: 0,
      templateCoverage: 0,
      queryCoverage: 0,
    },
    mutations,
    mutationSummary: '',
    metadata: {
      mode: 'BLASTX',
      templateType: 'Protein',
      detectedTemplateType: 'protein',
      alignmentScore: 0,
      templateCoverage: 0,
      queryCoverage: 0,
      matches: 0,
      mismatches: 0,
      gaps: 0,
      debug: [],
    },
    warnings: [],
  };
}

test('buildMutationTableRows keeps one query per row and sorts mutations by template position', () => {
  const rules: ColorRule[] = [
    { id: 'early', start: 1, end: 100, color: 'Green' },
    { id: 'late', start: 101, end: null, color: 'Purple' },
  ];
  const rows = buildMutationTableRows(
    [result('1-C7', [mutation('R152L', 152, 3), mutation('F65S', 65, 0), mutation('K115R', 115, 2)])],
    rules,
  );

  assert.equal(rows[0].queryName, '1-C7');
  assert.deepEqual(rows[0].mutations.map((item) => item.event), ['F65S', 'K115R', 'R152L']);
  assert.equal(rows[0].mutations[0].color.name, 'Green');
  assert.equal(rows[0].mutations[1].color.name, 'Purple');
});

test('buildMutationTableRows preserves insertion, deletion, and no-mutation rows', () => {
  const rules: ColorRule[] = [{ id: 'all', start: 1, end: null, color: 'Orange' }];
  const rows = buildMutationTableRows(
    [result('Insert and delete', [mutation('K31insE', 31, 0), mutation('K27del', 27, 1)]), result('Unchanged', [])],
    rules,
  );

  assert.deepEqual(rows[0].mutations.map((item) => item.event), ['K27del', 'K31insE']);
  assert.equal(rows[0].mutations[0].color.name, 'Orange');
  assert.deepEqual(rows[1].mutations, []);
});
