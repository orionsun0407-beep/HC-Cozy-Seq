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

test('parseFASTA uses the sample filename for a single generic assembly header', () => {
  const parsed = parseFASTA('>contig1 circular\nATGCGT\n', 'c12-1.genome.fa');

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.records[0].name, 'c12-1');
});

test('parseFASTA uses the sample filename for a consensus insert result', () => {
  const parsed = parseFASTA(
    '>S22607272133-AE12 insert\nATGCGT\n',
    'S22607272133-AE12.consensus.insert.fasta',
  );

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.records[0].name, 'S22607272133-AE12');
});

test('parseFASTA extracts the sample name from a vendor plasmids filename', () => {
  const header = '>1 len=5792 depth=1.00x plasmid_copy_number_long=infx circular=true\nATGCGT\n';
  const names = [
    ['3922030-MEMO-m3-G0_B242-0.plasmids.fasta', 'NEMO-m3'],
    ['3922029-MEMO-m2-G0_B241-0.plasmids.fasta', 'NEMO-m2'],
    ['3922028-MEMO-m1-G0_B240-0.plasmids.fasta', 'NEMO-m1'],
    ['3922027-MP3-G0_B239-0.plasmids.fasta', 'MP3'],
    ['3922022-MW1-G0_B234-0.plasmids.fasta', 'MW1'],
    ['3922020-SP2-G0_B232-0.plasmids.fasta', 'SP2'],
  ];

  for (const [filename, expected] of names) {
    const parsed = parseFASTA(header, filename);
    assert.equal(parsed.errors.length, 0);
    assert.equal(parsed.records[0].name, expected, filename);
  }
});

test('parseFASTA keeps separate names for a multi-record vendor plasmids file', () => {
  const parsed = parseFASTA('>1 len=6\nATGCGT\n>2 len=6\nATGAAA\n', '3922030-MEMO-m3-G0_B242-0.plasmids.fasta');

  assert.deepEqual(parsed.records.map((record) => record.name), ['1 len=6', '2 len=6']);
});

test('parseFASTA keeps a meaningful header instead of replacing it with the filename', () => {
  const parsed = parseFASTA('>F65S clone\nATGCGT\n', 'sample.fasta');

  assert.equal(parsed.records[0].name, 'F65S clone');
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
