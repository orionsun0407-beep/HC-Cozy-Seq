import type { DetectionResult, SequenceValidation } from '../types';
import { sanitizeSequence } from './fasta.ts';

const STRICT_DNA_ALPHABET = new Set(['A', 'T', 'C', 'G', 'N', 'U']);
const DNA_ALPHABET = new Set(['A', 'T', 'C', 'G', 'N', 'U', 'R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V']);
const PROTEIN_ALPHABET = new Set([
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
]);
const CLEAR_AMINO_ACIDS = new Set(['E', 'F', 'I', 'L', 'P', 'Q', 'O', 'J']);

function blankDetection(reason: string): DetectionResult {
  return {
    kind: 'invalid',
    confidence: 0,
    reason,
    length: 0,
    dnaRatio: 0,
    clearAminoAcidCount: 0,
  };
}

export function detectSequenceType(rawInput: string): DetectionResult {
  const sequence = sanitizeSequence(rawInput, { trimTerminalStops: true });
  if (!sequence) return blankDetection('未找到序列。');

  const hasInternalStop = sequence.slice(0, -1).includes('*');
  if (hasInternalStop) {
    return {
      kind: 'invalid',
      confidence: 0.95,
      reason: '序列包含内部 * stop 符号。',
      length: sequence.length,
      dnaRatio: 0,
      clearAminoAcidCount: 0,
    };
  }

  const letters = sequence.replace(/\*+$/g, '');
  if (!letters) return blankDetection('序列只包含 stop 符号。');

  const chars = [...letters];
  const invalidChars = chars.filter((char) => !PROTEIN_ALPHABET.has(char));
  if (invalidChars.length) {
    return {
      kind: 'invalid',
      confidence: 0.98,
      reason: `包含无法识别的字符: ${Array.from(new Set(invalidChars)).join(', ')}`,
      length: letters.length,
      dnaRatio: 0,
      clearAminoAcidCount: 0,
    };
  }

  const dnaCount = chars.filter((char) => DNA_ALPHABET.has(char)).length;
  const strictDnaCount = chars.filter((char) => STRICT_DNA_ALPHABET.has(char)).length;
  const clearAminoAcidCount = chars.filter((char) => CLEAR_AMINO_ACIDS.has(char)).length;
  const dnaRatio = dnaCount / chars.length;
  const allDnaAlphabet = dnaCount === chars.length;
  const allStrictDnaAlphabet = strictDnaCount === chars.length;

  if (allStrictDnaAlphabet && chars.length < 10) {
    return {
      kind: 'ambiguous',
      confidence: 0.48,
      reason: '短序列仅含 A/T/C/G/N，可能是短肽也可能是 DNA。',
      length: chars.length,
      dnaRatio,
      clearAminoAcidCount,
    };
  }

  if (allStrictDnaAlphabet) {
    return {
      kind: 'dna',
      confidence: 0.96,
      reason: '序列仅包含 A/T/C/G/N。',
      length: chars.length,
      dnaRatio,
      clearAminoAcidCount,
    };
  }

  if (allDnaAlphabet && clearAminoAcidCount === 0 && chars.length >= 18) {
    return {
      kind: 'dna',
      confidence: 0.78,
      reason: '序列仅包含常见 IUPAC DNA 碱基 / ambiguity codes。',
      length: chars.length,
      dnaRatio,
      clearAminoAcidCount,
    };
  }

  if (clearAminoAcidCount >= 2 || clearAminoAcidCount / chars.length >= 0.12) {
    return {
      kind: 'protein',
      confidence: Math.min(0.98, 0.65 + clearAminoAcidCount / Math.max(chars.length, 1)),
      reason: '检测到多个明确的氨基酸字符。',
      length: chars.length,
      dnaRatio,
      clearAminoAcidCount,
    };
  }

  if (dnaRatio >= 0.88 && chars.length >= 18) {
    return {
      kind: 'dna',
      confidence: 0.82,
      reason: '序列绝大多数字符为 DNA 碱基。',
      length: chars.length,
      dnaRatio,
      clearAminoAcidCount,
    };
  }

  if (clearAminoAcidCount === 1 && chars.length >= 8) {
    return {
      kind: 'protein',
      confidence: 0.58,
      reason: '检测到一个明确的氨基酸字符，但置信度较低。',
      length: chars.length,
      dnaRatio,
      clearAminoAcidCount,
    };
  }

  return {
    kind: 'ambiguous',
    confidence: 0.45,
    reason: '序列组成较短或较模糊。',
    length: chars.length,
    dnaRatio,
    clearAminoAcidCount,
  };
}

export function validateProteinSequence(rawInput: string): SequenceValidation {
  const sequence = sanitizeSequence(rawInput, { trimTerminalStops: true });
  const detection = detectSequenceType(sequence);

  if (!sequence) {
    return { valid: false, sequence, detection, message: '请输入蛋白质序列。' };
  }

  if (sequence.includes('*')) {
    return {
      valid: false,
      sequence,
      detection,
      message: '蛋白质序列中检测到内部 * stop 符号，请先确认序列。',
    };
  }

  if ([...sequence].some((char) => !PROTEIN_ALPHABET.has(char))) {
    return {
      valid: false,
      sequence,
      detection,
      message: detection.reason,
    };
  }

  if (detection.kind === 'dna') {
    return {
      valid: false,
      sequence,
      detection,
      message: '检测到疑似基因 / DNA 序列。BLASTP 仅支持蛋白质序列输入；如需输入基因序列，请切换到 BLASTX。',
    };
  }

  if (detection.kind === 'ambiguous' && [...sequence].every((char) => DNA_ALPHABET.has(char))) {
    return {
      valid: false,
      sequence,
      detection,
      message: '序列仅含 A/T/C/G/N 且较短，无法可靠判断为蛋白质。若是基因序列，请切换到 BLASTX。',
    };
  }

  if (detection.kind === 'invalid') {
    return { valid: false, sequence, detection, message: detection.reason };
  }

  return { valid: true, sequence, detection };
}

export function validateDNASequence(rawInput: string): SequenceValidation {
  const sequence = sanitizeSequence(rawInput).replace(/U/g, 'T');
  const detection = detectSequenceType(sequence);

  if (!sequence) {
    return { valid: false, sequence, detection, message: '请输入 DNA/CDS 序列。' };
  }

  if (![...sequence].every((char) => DNA_ALPHABET.has(char))) {
    return {
      valid: false,
      sequence,
      detection,
      message: 'DNA/CDS 序列只能包含 A、T、C、G、N 及常见 IUPAC ambiguity codes。',
    };
  }

  return { valid: true, sequence, detection };
}

export function looksLikeDNA(rawInput: string): boolean {
  return detectSequenceType(rawInput).kind === 'dna';
}
