import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleQueries, sampleTemplateProtein } from '../data/sampleData.ts';
import type { ComparisonHistoryEntry } from '../types.ts';
import { DEFAULT_COLOR_RULES } from './colorRules.ts';
import { runBlastpStyleComparison } from './comparison.ts';
import { createHistoryEntry, insertHistoryEntry, mergeHistoryEntries, parseHistoryFilePayload, removeHistoryEntry, serializeHistoryFilePayload } from './history.ts';

test('createHistoryEntry captures query stats and summaries for a successful run', () => {
  const template = { id: 'template', name: 'Template', sequence: sampleTemplateProtein };
  const results = sampleQueries.map((query) => runBlastpStyleComparison({ name: template.name, sequence: template.sequence }, query));
  const entry = createHistoryEntry({
    mode: 'BLASTP',
    templateType: 'Protein',
    template,
    queries: sampleQueries,
    colorRules: DEFAULT_COLOR_RULES,
    results,
  });

  assert.equal(entry.totalQueries, 2);
  assert.equal(entry.mutatedQueries, 2);
  assert.equal(entry.totalMutations, 3);
  assert.equal(entry.templateLength, sampleTemplateProtein.length);
  assert.equal(entry.summaries[0].mutationSummary, 'F2-K150R');
});

test('insertHistoryEntry sorts newest first and enforces the limit', () => {
  const older: ComparisonHistoryEntry = {
    id: 'older',
    createdAt: '2026-05-07T00:00:00.000Z',
    mode: 'BLASTP',
    templateType: 'Protein',
    template: { id: 'template', name: 'T', sequence: 'MKI' },
    queries: [{ id: 'q1', name: 'Q1', sequence: 'MKI' }],
    colorRules: DEFAULT_COLOR_RULES,
    templateLength: 3,
    totalQueries: 1,
    mutatedQueries: 0,
    totalMutations: 0,
    summaries: [],
  };
  const newer = { ...older, id: 'newer', createdAt: '2026-05-08T00:00:00.000Z' };

  const inserted = insertHistoryEntry([older], newer, 1);

  assert.deepEqual(inserted.map((entry) => entry.id), ['newer']);
});

test('removeHistoryEntry deletes only the requested record', () => {
  const base: ComparisonHistoryEntry = {
    id: 'base',
    createdAt: '2026-05-07T00:00:00.000Z',
    mode: 'BLASTX',
    templateType: 'DNA',
    template: { id: 'template', name: 'T', sequence: 'ATGGCC' },
    queries: [{ id: 'q1', name: 'Q1', sequence: 'ATGGCC' }],
    colorRules: DEFAULT_COLOR_RULES,
    templateLength: 2,
    totalQueries: 1,
    mutatedQueries: 0,
    totalMutations: 0,
    summaries: [],
  };

  const kept = { ...base, id: 'kept' };
  const next = removeHistoryEntry([base, kept], 'base');

  assert.deepEqual(next.map((entry) => entry.id), ['kept']);
});

test('serializeHistoryFilePayload and parseHistoryFilePayload round-trip valid entries', () => {
  const entry: ComparisonHistoryEntry = {
    id: 'entry-1',
    createdAt: '2026-05-08T00:00:00.000Z',
    mode: 'BLASTP',
    templateType: 'Protein',
    template: { id: 'template', name: 'Template', sequence: 'MKI' },
    queries: [{ id: 'q1', name: 'Q1', sequence: 'MKI' }],
    colorRules: DEFAULT_COLOR_RULES,
    templateLength: 3,
    totalQueries: 1,
    mutatedQueries: 0,
    totalMutations: 0,
    summaries: [],
  };

  const raw = serializeHistoryFilePayload([entry]);
  const parsed = parseHistoryFilePayload(raw);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'entry-1');
});

test('mergeHistoryEntries deduplicates by id and keeps newest entries first', () => {
  const older: ComparisonHistoryEntry = {
    id: 'same',
    createdAt: '2026-05-07T00:00:00.000Z',
    mode: 'BLASTP',
    templateType: 'Protein',
    template: { id: 'template', name: 'Template', sequence: 'MKI' },
    queries: [{ id: 'q1', name: 'Q1', sequence: 'MKI' }],
    colorRules: DEFAULT_COLOR_RULES,
    templateLength: 3,
    totalQueries: 1,
    mutatedQueries: 0,
    totalMutations: 0,
    summaries: [],
  };
  const newer = { ...older, id: 'newer', createdAt: '2026-05-08T00:00:00.000Z' };

  const merged = mergeHistoryEntries([older], [older, newer]);

  assert.deepEqual(merged.map((entry) => entry.id), ['newer', 'same']);
});
