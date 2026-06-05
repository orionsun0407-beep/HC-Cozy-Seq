import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFASTA, parseSequenceText, sanitizeSequence, trimTerminalStopSymbol } from './fasta.ts';

test('parseFASTA parses multiple records and strips headers, spaces, and numbers', () => {
  const parsed = parseFASTA('>F2\nM K 1 T\nAY\n>F3\nACD 23 EF\n', 'sample.fasta');

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(
    parsed.records.map((record) => [record.name, record.sequence]),
    [
      ['F2', 'MKTAY'],
      ['F3', 'ACDEF'],
    ],
  );
});

test('sanitizeSequence removes pasted FASTA headers', () => {
  assert.equal(sanitizeSequence('>header\nacg 123\nTT'), 'ACGTT');
});

test('trimTerminalStopSymbol removes only terminal stops', () => {
  assert.equal(trimTerminalStopSymbol('MKT***'), 'MKT');
  assert.equal(trimTerminalStopSymbol('MK*T***'), 'MK*T');
});

test('parseSequenceText extracts GenBank ORIGIN sequence', () => {
  const parsed = parseSequenceText(`LOCUS       demo\nORIGIN\n        1 atgc nry\n       11 tacg\n//`, 'demo.gbk');

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.records[0].name, 'demo');
  assert.equal(parsed.records[0].sequence, 'ATGCNRYTACG');
});

test('parseSequenceText extracts FASTQ records', () => {
  const parsed = parseSequenceText('@read1\nATGCNN\n+\n!!!!!!\n', 'reads.fastq');

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.records[0].name, 'read1');
  assert.equal(parsed.records[0].sequence, 'ATGCNN');
});
