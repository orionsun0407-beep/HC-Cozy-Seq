import type { OrfCandidate } from '../types';
import { sanitizeSequence } from './fasta.ts';

const CODON_TABLE: Record<string, string> = {
  TTT: 'F',
  TTC: 'F',
  TTA: 'L',
  TTG: 'L',
  TCT: 'S',
  TCC: 'S',
  TCA: 'S',
  TCG: 'S',
  TAT: 'Y',
  TAC: 'Y',
  TAA: '*',
  TAG: '*',
  TGT: 'C',
  TGC: 'C',
  TGA: '*',
  TGG: 'W',
  CTT: 'L',
  CTC: 'L',
  CTA: 'L',
  CTG: 'L',
  CCT: 'P',
  CCC: 'P',
  CCA: 'P',
  CCG: 'P',
  CAT: 'H',
  CAC: 'H',
  CAA: 'Q',
  CAG: 'Q',
  CGT: 'R',
  CGC: 'R',
  CGA: 'R',
  CGG: 'R',
  ATT: 'I',
  ATC: 'I',
  ATA: 'I',
  ATG: 'M',
  ACT: 'T',
  ACC: 'T',
  ACA: 'T',
  ACG: 'T',
  AAT: 'N',
  AAC: 'N',
  AAA: 'K',
  AAG: 'K',
  AGT: 'S',
  AGC: 'S',
  AGA: 'R',
  AGG: 'R',
  GTT: 'V',
  GTC: 'V',
  GTA: 'V',
  GTG: 'V',
  GCT: 'A',
  GCC: 'A',
  GCA: 'A',
  GCG: 'A',
  GAT: 'D',
  GAC: 'D',
  GAA: 'E',
  GAG: 'E',
  GGT: 'G',
  GGC: 'G',
  GGA: 'G',
  GGG: 'G',
};

export const AMINO_ACID_TO_CODON: Record<string, string> = {
  A: 'GCT',
  B: 'GAT',
  C: 'TGT',
  D: 'GAT',
  E: 'GAA',
  F: 'TTT',
  G: 'GGT',
  H: 'CAT',
  I: 'ATT',
  J: 'CTT',
  K: 'AAA',
  L: 'CTT',
  M: 'ATG',
  N: 'AAT',
  O: 'AAA',
  P: 'CCT',
  Q: 'CAA',
  R: 'CGT',
  S: 'TCT',
  T: 'ACT',
  U: 'TGT',
  V: 'GTT',
  W: 'TGG',
  X: 'NNN',
  Y: 'TAT',
  Z: 'GAA',
};

export function reverseComplement(rawInput: string): string {
  const sequence = sanitizeSequence(rawInput).replace(/U/g, 'T');
  const complement: Record<string, string> = {
    A: 'T',
    T: 'A',
    C: 'G',
    G: 'C',
    N: 'N',
    R: 'N',
    Y: 'N',
    S: 'N',
    W: 'N',
    K: 'N',
    M: 'N',
    B: 'N',
    D: 'N',
    H: 'N',
    V: 'N',
  };
  return [...sequence]
    .reverse()
    .map((base) => complement[base] ?? 'N')
    .join('');
}

export function translateDNA(rawInput: string, frameOffset = 0, reverse = false): string {
  const sequence = reverse ? reverseComplement(rawInput) : sanitizeSequence(rawInput).replace(/U/g, 'T');
  const aminoAcids: string[] = [];

  for (let index = frameOffset; index + 2 < sequence.length; index += 3) {
    const codon = sequence.slice(index, index + 3);
    aminoAcids.push(CODON_TABLE[codon] ?? 'X');
  }

  return aminoAcids.join('');
}

export function proteinToDna(protein: string): string {
  return [...protein].map((aa) => AMINO_ACID_TO_CODON[aa] ?? 'NNN').join('');
}

export function getSixFrameTranslations(rawInput: string): Array<{
  frameLabel: string;
  frameOffset: number;
  strand: '+' | '-';
  protein: string;
}> {
  const frames = [0, 1, 2] as const;
  return [
    ...frames.map((frameOffset) => ({
      frameLabel: `+${frameOffset + 1}`,
      frameOffset,
      strand: '+' as const,
      protein: translateDNA(rawInput, frameOffset, false),
    })),
    ...frames.map((frameOffset) => ({
      frameLabel: `-${frameOffset + 1}`,
      frameOffset,
      strand: '-' as const,
      protein: translateDNA(rawInput, frameOffset, true),
    })),
  ];
}

export function getOrfCandidates(rawInput: string): OrfCandidate[] {
  const sequence = sanitizeSequence(rawInput);
  const candidates: OrfCandidate[] = [];

  for (const frame of getSixFrameTranslations(sequence)) {
    const segments = frame.protein.split('*');
    let segmentStart = 0;

    for (const segment of segments) {
      if (segment.length) {
        const metPositions = [...segment]
          .map((aa, index) => (aa === 'M' ? index : -1))
          .filter((index) => index >= 0);
        const starts = metPositions.length ? metPositions : [0];

        for (const startInSegment of starts) {
          const protein = segment.slice(startInSegment);
          if (!protein) continue;

          const startAA = segmentStart + startInSegment + 1;
          const endAA = segmentStart + segment.length;
          candidates.push({
            id: `${frame.frameLabel}:${startAA}-${endAA}${metPositions.length ? ':M' : ':fallback'}`,
            frameLabel: frame.frameLabel,
            frameOffset: frame.frameOffset,
            strand: frame.strand,
            protein,
            startAA,
            endAA,
            metStart: segment[startInSegment] === 'M',
            sourceLength: sequence.length,
          });
        }
      }

      segmentStart += segment.length + 1;
    }
  }

  return candidates.sort((a, b) => {
    if (a.metStart !== b.metStart) return a.metStart ? -1 : 1;
    return b.protein.length - a.protein.length;
  });
}
