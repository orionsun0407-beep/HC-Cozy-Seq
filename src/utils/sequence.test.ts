import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSequenceType, validateDNASequence, validateProteinSequence } from './sequence.ts';

test('detectSequenceType identifies clear DNA', () => {
  const detection = detectSequenceType('ATGCGTACGTNNATGCGTACGT');
  assert.equal(detection.kind, 'dna');
});

test('detectSequenceType identifies clear protein', () => {
  const detection = detectSequenceType('MKTAYIAKQRQISFVKSHFSR');
  assert.equal(detection.kind, 'protein');
});

test('detectSequenceType keeps short ATGC-only sequences ambiguous', () => {
  const detection = detectSequenceType('ATG');
  assert.equal(detection.kind, 'ambiguous');
});

test('validateProteinSequence blocks DNA-like BLASTP input with the required message', () => {
  const validation = validateProteinSequence('ATGCGTACGTATGCGTACGT');
  assert.equal(validation.valid, false);
  assert.equal(
    validation.message,
    '检测到疑似基因 / DNA 序列。BLASTP 仅支持蛋白质序列输入；如需输入基因序列，请切换到 BLASTX。',
  );
});

test('validateDNASequence accepts common IUPAC ambiguity codes and normalizes U', () => {
  const validation = validateDNASequence('AUGCRYSWKMBDHVN');

  assert.equal(validation.valid, true);
  assert.equal(validation.sequence, 'ATGCRYSWKMBDHVN');
});
