import type {
  AlignmentResult,
  CandidateAlignment,
  ComparisonMetadata,
  ComparisonResult,
  DetectionResult,
  FastaRecord,
  OrfCandidate,
  TemplateType,
} from '../types';
import { smithWaterman } from './alignment.ts';
import { sanitizeSequence } from './fasta.ts';
import { detectSequenceType } from './sequence.ts';
import { getOrfCandidates } from './translation.ts';
import { extractMutations, formatMutationSummary } from './mutations.ts';

function emptyAlignment(): AlignmentResult {
  return {
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
  };
}

function proteinCandidate(name: string, protein: string): OrfCandidate {
  return {
    id: `${name}:protein`,
    frameLabel: 'protein',
    frameOffset: 0,
    strand: '+',
    protein,
    startAA: 1,
    endAA: protein.length,
    metStart: protein.startsWith('M'),
    sourceLength: protein.length,
  };
}

function rankAlignment(templateCandidate: OrfCandidate, queryCandidate: OrfCandidate, alignment: AlignmentResult): number {
  const coverageReward = alignment.templateCoverage * 45 + alignment.queryCoverage * 12;
  const qualityPenalty = alignment.mismatches * 1.2 + alignment.gaps * 2.8;
  const metReward = (templateCandidate.metStart ? 8 : 0) + (queryCandidate.metStart ? 12 : 0);
  const lengthBalance = Math.min(templateCandidate.protein.length, queryCandidate.protein.length) /
    Math.max(templateCandidate.protein.length, queryCandidate.protein.length, 1);

  return alignment.score + coverageReward + metReward + lengthBalance * 8 - qualityPenalty;
}

function maxPossibleRank(templateCandidate: OrfCandidate, queryCandidate: OrfCandidate): number {
  const maxAlignmentScore = Math.min(templateCandidate.protein.length, queryCandidate.protein.length) * 4;
  const maxCoverageReward = 45 + 12;
  const maxMetReward = (templateCandidate.metStart ? 8 : 0) + (queryCandidate.metStart ? 12 : 0);
  const maxLengthBalanceReward = 8;

  return maxAlignmentScore + maxCoverageReward + maxMetReward + maxLengthBalanceReward;
}

function selectBestCandidateAlignment(
  templateCandidates: OrfCandidate[],
  queryCandidates: OrfCandidate[],
): { best: CandidateAlignment | null; evaluatedPairs: number; skippedPairs: number; cachedPairs: number } {
  let best: CandidateAlignment | null = null;
  let evaluatedPairs = 0;
  let skippedPairs = 0;
  let cachedPairs = 0;
  const alignmentCache = new Map<string, AlignmentResult>();

  for (const templateCandidate of templateCandidates) {
    for (const queryCandidate of queryCandidates) {
      if (best && maxPossibleRank(templateCandidate, queryCandidate) <= best.rankScore) {
        skippedPairs += 1;
        continue;
      }

      const cacheKey = `${templateCandidate.protein}\u0000${queryCandidate.protein}`;
      let alignment = alignmentCache.get(cacheKey);
      if (alignment) {
        cachedPairs += 1;
      } else {
        alignment = smithWaterman(templateCandidate.protein, queryCandidate.protein);
        alignmentCache.set(cacheKey, alignment);
      }
      evaluatedPairs += 1;
      const rankScore = rankAlignment(templateCandidate, queryCandidate, alignment);

      if (!best || rankScore > best.rankScore) {
        best = { templateCandidate, queryCandidate, alignment, rankScore };
      }
    }
  }

  return { best, evaluatedPairs, skippedPairs, cachedPairs };
}

function metadataFromAlignment(
  mode: 'BLASTP' | 'BLASTX',
  templateType: string,
  detectedTemplateType: DetectionResult,
  alignment: AlignmentResult,
  debug: string[],
  templateCandidate?: OrfCandidate,
  queryCandidate?: OrfCandidate,
): ComparisonMetadata {
  return {
    mode,
    templateType,
    detectedTemplateType: detectedTemplateType.kind,
    templateFrame: templateCandidate?.frameLabel,
    queryFrame: queryCandidate?.frameLabel,
    templateOrfLength: templateCandidate?.protein.length,
    queryOrfLength: queryCandidate?.protein.length,
    templateMetStart: templateCandidate?.metStart,
    queryMetStart: queryCandidate?.metStart,
    alignmentScore: alignment.score,
    templateCoverage: alignment.templateCoverage,
    queryCoverage: alignment.queryCoverage,
    matches: alignment.matches,
    mismatches: alignment.mismatches,
    gaps: alignment.gaps,
    debug,
  };
}

export function runBlastpStyleComparison(template: FastaRecord, query: FastaRecord): ComparisonResult {
  const templateProtein = sanitizeSequence(template.sequence, { trimTerminalStops: true });
  const queryProtein = sanitizeSequence(query.sequence, { trimTerminalStops: true });
  const detectedTemplateType = detectSequenceType(templateProtein);
  const alignment = smithWaterman(templateProtein, queryProtein);
  const mutations = extractMutations(alignment, templateProtein, queryProtein);

  return {
    id: `${template.name}-${query.name}-${crypto.randomUUID()}`,
    mode: 'BLASTP',
    templateName: template.name,
    queryName: query.name,
    templateProteinUsed: templateProtein,
    queryProteinUsed: queryProtein,
    alignment,
    mutations,
    mutationSummary: formatMutationSummary(query.name, mutations),
    metadata: metadataFromAlignment('BLASTP', 'Protein', detectedTemplateType, alignment, [
      `Protein local alignment: template ${templateProtein.length} aa, query ${queryProtein.length} aa.`,
    ]),
    warnings: alignment.score <= 0 ? ['未找到可靠的局部蛋白质比对窗口。'] : [],
  };
}

function makeNoCandidateResult(template: FastaRecord, query: FastaRecord, templateType: string, message: string): ComparisonResult {
  const detectedTemplateType = detectSequenceType(template.sequence);
  const alignment = emptyAlignment();
  return {
    id: `${template.name}-${query.name}-${crypto.randomUUID()}`,
    mode: 'BLASTX',
    templateName: template.name,
    queryName: query.name,
    templateProteinUsed: '',
    queryProteinUsed: '',
    alignment,
    mutations: [],
    mutationSummary: formatMutationSummary(query.name, []),
    metadata: metadataFromAlignment('BLASTX', templateType, detectedTemplateType, alignment, [message]),
    warnings: [message],
  };
}

export function runBlastxStyleComparison(
  template: FastaRecord,
  query: FastaRecord,
  resolvedTemplateType: Exclude<TemplateType, 'Auto'>,
): ComparisonResult {
  const detectedTemplateType = detectSequenceType(template.sequence);
  const warnings: string[] = [];

  const templateCandidates =
    resolvedTemplateType === 'Protein'
      ? [proteinCandidate(template.name, sanitizeSequence(template.sequence, { trimTerminalStops: true }))]
      : getOrfCandidates(template.sequence);
  const queryCandidates = getOrfCandidates(query.sequence);

  if (!templateCandidates.length) {
    return makeNoCandidateResult(template, query, resolvedTemplateType, '模板序列未找到有效 ORF 候选。');
  }

  if (!queryCandidates.length) {
    return makeNoCandidateResult(template, query, resolvedTemplateType, 'Query 序列未找到有效 ORF 候选。');
  }

  if (!templateCandidates.some((candidate) => candidate.metStart) && resolvedTemplateType === 'DNA') {
    warnings.push('模板 DNA 未找到 Met 起始 ORF，已使用最长无 stop 片段作为候选。');
  }

  if (!queryCandidates.some((candidate) => candidate.metStart)) {
    warnings.push('Query DNA 未找到 Met 起始 ORF，已使用无 stop 片段作为 fallback 候选。');
  }

  const selection = selectBestCandidateAlignment(templateCandidates, queryCandidates);
  const best = selection.best;
  if (!best) {
    return makeNoCandidateResult(template, query, resolvedTemplateType, '未找到可用于突变分析的 ORF 比对。');
  }

  const mutations = extractMutations(best.alignment, best.templateCandidate.protein, best.queryCandidate.protein);
  const topDebug = [
    `Selected template candidate ${best.templateCandidate.id}, ${best.templateCandidate.protein.length} aa.`,
    `Selected query candidate ${best.queryCandidate.id}, ${best.queryCandidate.protein.length} aa.`,
    `Rank score ${best.rankScore.toFixed(2)} combines alignment score, coverage, gaps, mismatches, and Met-start preference.`,
    `Candidate search evaluated ${selection.evaluatedPairs} pair(s), skipped ${selection.skippedPairs} by safe upper-bound pruning, reused ${selection.cachedPairs} cached alignment(s).`,
  ];

  return {
    id: `${template.name}-${query.name}-${crypto.randomUUID()}`,
    mode: 'BLASTX',
    templateName: template.name,
    queryName: query.name,
    templateProteinUsed: best.templateCandidate.protein,
    queryProteinUsed: best.queryCandidate.protein,
    alignment: best.alignment,
    mutations,
    mutationSummary: formatMutationSummary(query.name, mutations),
    metadata: metadataFromAlignment(
      'BLASTX',
      resolvedTemplateType,
      detectedTemplateType,
      best.alignment,
      topDebug,
      best.templateCandidate,
      best.queryCandidate,
    ),
    warnings: best.alignment.score <= 0 ? [...warnings, '未找到可靠的翻译后局部比对窗口。'] : warnings,
  };
}
