import type { FastaParseResult, FastaRecord } from '../types';

const SUPPORTED_SEQUENCE_EXTENSIONS = /\.(fasta|fas|fa|mpfa|faa|pep|aa|fna|ffn|frn|cds|nt|fastq|fq|txt|seq|gb|gbk|genbank|embl|dna|ape)$/i;
const IUPAC_SEQUENCE_RUN = /[ACGTRYSWKMBDHVNUacgtryswkmbdhvnu]{24,}/g;

export function trimTerminalStopSymbol(sequence: string): string {
  return sequence.replace(/\*+$/g, '');
}

export function removeFastaHeaders(input: string): string {
  return input
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('>'))
    .join('');
}

export function sanitizeSequence(
  input: string,
  options: { trimTerminalStops?: boolean } = {},
): string {
  const withoutHeaders = removeFastaHeaders(input);
  const cleaned = withoutHeaders.replace(/[0-9\s]/g, '').toUpperCase();
  return options.trimTerminalStops ? trimTerminalStopSymbol(cleaned) : cleaned;
}

function sanitizeFastaBody(lines: string[]): string {
  return lines.join('').replace(/[0-9\s]/g, '').toUpperCase();
}

function fallbackName(sourceName?: string): string {
  if (!sourceName) return 'Sequence';
  return sourceName.replace(SUPPORTED_SEQUENCE_EXTENSIONS, '') || 'Sequence';
}

function parseGenBank(text: string, sourceName?: string): FastaParseResult | null {
  const match = text.match(/(?:^|\n)\s*ORIGIN\s*\n([\s\S]*?)(?:\n\s*\/\/|\s*$)/i);
  if (!match) return null;

  const name =
    text.match(/(?:^|\n)\s*LOCUS\s+([^\s]+)/i)?.[1] ??
    text.match(/(?:^|\n)\s*VERSION\s+([^\s]+)/i)?.[1] ??
    fallbackName(sourceName);
  const sequence = match[1].replace(/[^A-Za-z]/g, '').toUpperCase();

  if (!sequence) {
    return { records: [], warnings: [], errors: ['GenBank 文件包含 ORIGIN，但未找到有效序列。'] };
  }

  return {
    records: [{ name, sequence, source: sourceName }],
    warnings: [],
    errors: [],
  };
}

function parseEmbl(text: string, sourceName?: string): FastaParseResult | null {
  const match = text.match(/(?:^|\n)\s*SQ\s+[\s\S]*?\n([\s\S]*?)(?:\n\s*\/\/|\s*$)/i);
  if (!match) return null;

  const name = text.match(/(?:^|\n)\s*ID\s+([^;\s]+)/i)?.[1] ?? fallbackName(sourceName);
  const sequence = match[1].replace(/[^A-Za-z]/g, '').toUpperCase();

  if (!sequence) {
    return { records: [], warnings: [], errors: ['EMBL 文件包含 SQ 区段，但未找到有效序列。'] };
  }

  return {
    records: [{ name, sequence, source: sourceName }],
    warnings: [],
    errors: [],
  };
}

function parseFastq(text: string, sourceName?: string): FastaParseResult | null {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length || !lines[0].startsWith('@')) return null;

  const records: FastaRecord[] = [];
  const warnings: string[] = [];

  for (let index = 0; index + 3 < lines.length; index += 4) {
    const header = lines[index];
    const sequenceLine = lines[index + 1];
    const plus = lines[index + 2];
    if (!header.startsWith('@') || !plus.startsWith('+')) {
      warnings.push('FASTQ 记录结构不完整，已停止解析后续内容。');
      break;
    }

    const sequence = sanitizeSequence(sequenceLine);
    if (sequence) {
      records.push({
        name: header.slice(1).trim() || `${fallbackName(sourceName)} ${records.length + 1}`,
        sequence,
        source: sourceName,
      });
    }
  }

  return records.length
    ? { records, warnings, errors: [] }
    : { records: [], warnings, errors: ['未解析到有效 FASTQ 记录。'] };
}

function parseLongestSequenceRun(text: string, sourceName?: string): FastaParseResult | null {
  const runs = text.match(IUPAC_SEQUENCE_RUN);
  if (!runs?.length) return null;

  const sequence = runs
    .sort((a, b) => b.length - a.length)[0]
    .replace(/\s/g, '')
    .toUpperCase();

  return {
    records: [{ name: fallbackName(sourceName), sequence, source: sourceName }],
    warnings: [
      `${sourceName ?? 'Sequence file'} 使用了通用序列提取模式；原生 SnapGene .dna 属于专有二进制格式，建议优先从 SnapGene 导出 FASTA 或 GenBank。`,
    ],
    errors: [],
  };
}

export function parseFASTA(text: string, sourceName?: string): FastaParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return { records: [], warnings, errors: ['FASTA 文件为空。'] };
  }

  if (!normalized.includes('>')) {
    const sequence = sanitizeSequence(normalized);
    if (!sequence) {
      return { records: [], warnings, errors: ['未找到有效序列内容。'] };
    }
    return {
      records: [{ name: fallbackName(sourceName), sequence, source: sourceName }],
      warnings,
      errors,
    };
  }

  const records: FastaRecord[] = [];
  let activeName = '';
  let activeLines: string[] = [];

  const flush = () => {
    if (!activeName) return;
    const sequence = sanitizeFastaBody(activeLines);
    if (!sequence) {
      warnings.push(`记录 ${activeName} 没有可用序列，已跳过。`);
      return;
    }
    records.push({ name: activeName, sequence, source: sourceName });
  };

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('>')) {
      flush();
      activeName = trimmed.slice(1).trim() || fallbackName(sourceName);
      activeLines = [];
    } else if (!activeName) {
      warnings.push('发现首个 FASTA header 前的内容，已忽略。');
    } else {
      activeLines.push(trimmed);
    }
  }

  flush();

  if (!records.length) {
    errors.push('未解析到有效 FASTA 记录。');
  }

  return { records, warnings, errors };
}

export function parseSequenceText(text: string, sourceName?: string): FastaParseResult {
  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return { records: [], warnings: [], errors: ['序列文件为空。'] };
  }

  if (/^\s*>/m.test(normalized)) {
    return parseFASTA(normalized, sourceName);
  }

  const fastq = parseFastq(normalized, sourceName);
  if (fastq) return fastq;

  const genBank = parseGenBank(normalized, sourceName);
  if (genBank) return genBank;

  const embl = parseEmbl(normalized, sourceName);
  if (embl) return embl;

  return parseFASTA(normalized, sourceName);
}

export async function readFastaFiles(files: FileList | File[]): Promise<FastaParseResult> {
  const allRecords: FastaRecord[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const file of Array.from(files)) {
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const isBinaryLike = /\.(dna|ape)$/i.test(file.name);
    const hasStructuredText =
      /^\s*>/m.test(text) || /(?:^|\n)\s*ORIGIN\s*\n/i.test(text) || /(?:^|\n)\s*SQ\s+/i.test(text) || /^\s*@/m.test(text);
    let parsed: FastaParseResult;

    if (isBinaryLike && !hasStructuredText) {
      const binaryText = new TextDecoder('latin1', { fatal: false }).decode(buffer);
      parsed =
        parseLongestSequenceRun(binaryText, file.name) ?? {
          records: [],
          warnings: [],
          errors: ['未能从原生 SnapGene/ApE 二进制文件中提取序列；请从软件导出 FASTA 或 GenBank 后再上传。'],
        };
    } else {
      parsed = parseSequenceText(text, file.name);
    }

    allRecords.push(...parsed.records);
    warnings.push(...parsed.warnings);
    errors.push(...parsed.errors.map((error) => `${file.name}: ${error}`));
  }

  return { records: allRecords, warnings, errors };
}

export { SUPPORTED_SEQUENCE_EXTENSIONS };
