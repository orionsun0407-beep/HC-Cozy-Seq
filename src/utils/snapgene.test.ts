import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSnapGeneSignature, parseSnapGeneSequence } from './snapgene.ts';
import { readFastaFiles } from './fasta.ts';

const encoder = new TextEncoder();

function packet(type: number, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(5 + data.length);
  bytes[0] = type;
  new DataView(bytes.buffer).setUint32(1, data.length, false);
  bytes.set(data, 5);
  return bytes;
}

function concat(...packets: Uint8Array[]): ArrayBuffer {
  const bytes = new Uint8Array(packets.reduce((sum, item) => sum + item.length, 0));
  let offset = 0;
  for (const item of packets) {
    bytes.set(item, offset);
    offset += item.length;
  }
  return bytes.buffer;
}

function cookie(): Uint8Array {
  return packet(0x09, new Uint8Array([...encoder.encode('SnapGene'), 0, 1, 0, 1, 0, 1]));
}

function dna(sequence: string, flags = 1): Uint8Array {
  return packet(0x00, new Uint8Array([flags, ...encoder.encode(sequence)]));
}

test('SnapGene reads the DNA packet, preserving ambiguous bases and ignoring annotations', () => {
  for (const flags of [0, 1]) {
    const buffer = concat(cookie(), packet(0x06, encoder.encode('ACGT'.repeat(30))), dna('atgcNRYSWKMBDHV', flags));
    assert.equal(hasSnapGeneSignature(buffer), true);
    assert.equal(parseSnapGeneSequence(buffer), 'ATGCNRYSWKMBDHV');
  }
});

test('SnapGene validates packet boundaries and requires exactly one DNA packet', () => {
  assert.throws(() => parseSnapGeneSequence(concat(cookie(), dna('ATGC')).slice(0, -1)), /截断/);
  assert.throws(() => parseSnapGeneSequence(concat(cookie(), new Uint8Array([0x06, 0]))), /截断/);
  assert.throws(() => parseSnapGeneSequence(concat(cookie())), /未包含 DNA/);
  assert.throws(() => parseSnapGeneSequence(concat(cookie(), dna(''))), /为空/);
  assert.throws(() => parseSnapGeneSequence(concat(cookie(), dna('ATGC'), dna('AAAA'))), /多个 DNA/);
  assert.throws(() => parseSnapGeneSequence(concat(cookie(), dna('ATGC>FASTA'))), /无效碱基/);
  const badLength = concat(cookie(), dna('ATGC'));
  new DataView(badLength).setUint32(1, 13, false);
  assert.throws(() => parseSnapGeneSequence(badLength), /文件头长度/);
});

test('native SnapGene uploads ignore FASTA-looking annotations and retain the filename', async () => {
  const buffer = concat(cookie(), dna('ATGCGT'), packet(0x06, encoder.encode('\n>misleading annotation\n' + 'ACGT'.repeat(30))));
  const parsed = await readFastaFiles([new File([buffer], '我的模板.dna')]);
  assert.deepEqual(parsed.records, [{ name: '我的模板', sequence: 'ATGCGT', source: '我的模板.dna' }]);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.warnings, []);
});

test('a damaged SnapGene upload reports an error while other batch files still load', async () => {
  const invalid = concat(cookie(), dna('ATGC'), packet(0x06, encoder.encode('\n>fake\nAAAA')));
  new Uint8Array(invalid)[5] = 0x58;
  const parsed = await readFastaFiles([
    new File([invalid], 'damaged.dna'),
    new File([concat(cookie(), dna('ATGAAA'))], 'good.dna'),
  ]);
  assert.deepEqual(parsed.records.map(item => [item.name, item.sequence]), [['good', 'ATGAAA']]);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0], /damaged.dna:.*不是有效/);
});

test('DNA extensions still accept FASTA, GenBank, and plain sequence text', async () => {
  const parsed = await readFastaFiles([
    new File(['>clone\nATGCGT'], 'export.dna'),
    new File(['LOCUS       demo\nORIGIN\n        1 atgcgt\n//'], 'genbank.dna'),
    new File(['ATGC GT\n'], 'plain.dna'),
  ]);
  assert.deepEqual(parsed.records.map(item => [item.name, item.sequence]), [['clone', 'ATGCGT'], ['demo', 'ATGCGT'], ['plain', 'ATGCGT']]);
  assert.deepEqual(parsed.errors, []);
});
