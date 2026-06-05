export type Mode = 'BLASTP' | 'BLASTX';

export type TemplateType = 'Auto' | 'Protein' | 'DNA';

export type SequenceKind = 'dna' | 'protein' | 'ambiguous' | 'invalid';

export type AlertTone = 'error' | 'warning' | 'success' | 'info';

export interface AppAlert {
  id: string;
  tone: AlertTone;
  message: string;
}

export interface FastaRecord {
  name: string;
  sequence: string;
  source?: string;
}

export interface FastaParseResult {
  records: FastaRecord[];
  warnings: string[];
  errors: string[];
}

export interface DetectionResult {
  kind: SequenceKind;
  confidence: number;
  reason: string;
  length: number;
  dnaRatio: number;
  clearAminoAcidCount: number;
}

export interface SequenceValidation {
  valid: boolean;
  sequence: string;
  detection: DetectionResult;
  message?: string;
}

export interface SequenceInput {
  id: string;
  name: string;
  sequence: string;
}

export interface BlastxTemplatePreset {
  id: string;
  name: string;
  sequence: string;
  templateType: Exclude<TemplateType, 'Auto'>;
  updatedAt: string;
}

export interface AlignmentResult {
  alignedTemplate: string;
  alignedQuery: string;
  templateStart: number;
  templateEnd: number;
  queryStart: number;
  queryEnd: number;
  score: number;
  matches: number;
  mismatches: number;
  gaps: number;
  alignedResidues: number;
  templateCoverage: number;
  queryCoverage: number;
}

export interface Mutation {
  from: string;
  to: string;
  templatePosition: number;
  templateEndPosition?: number;
  queryPosition: number;
  queryEndPosition?: number;
  alignmentColumn: number;
  alignmentEndColumn?: number;
  event: string;
}

export interface OrfCandidate {
  id: string;
  frameLabel: string;
  frameOffset: number;
  strand: '+' | '-';
  protein: string;
  startAA: number;
  endAA: number;
  metStart: boolean;
  sourceLength: number;
}

export interface CandidateAlignment {
  templateCandidate: OrfCandidate;
  queryCandidate: OrfCandidate;
  alignment: AlignmentResult;
  rankScore: number;
}

export interface ComparisonMetadata {
  mode: Mode;
  templateType: string;
  detectedTemplateType: SequenceKind;
  templateFrame?: string;
  queryFrame?: string;
  templateOrfLength?: number;
  queryOrfLength?: number;
  templateMetStart?: boolean;
  queryMetStart?: boolean;
  alignmentScore: number;
  templateCoverage: number;
  queryCoverage: number;
  matches: number;
  mismatches: number;
  gaps: number;
  debug: string[];
}

export interface ComparisonResult {
  id: string;
  mode: Mode;
  templateName: string;
  queryName: string;
  templateProteinUsed: string;
  queryProteinUsed: string;
  alignment: AlignmentResult;
  mutations: Mutation[];
  mutationSummary: string;
  metadata: ComparisonMetadata;
  warnings: string[];
}

export type PrismColorName =
  | 'Blue'
  | 'Red'
  | 'Yellow'
  | 'Green'
  | 'Purple'
  | 'Orange'
  | 'Pink'
  | 'Teal'
  | 'Gray';

export interface ColorRule {
  id: string;
  start: number;
  end: number | null;
  color: PrismColorName;
}

export interface BatchPositionStat {
  position: number;
  count: number;
  queryNames: string[];
}

export interface BatchMutationStat {
  event: string;
  position: number;
  count: number;
  queryNames: string[];
}

export interface BatchStatistics {
  totalQueries: number;
  mutatedQueries: number;
  totalMutations: number;
  frequentPositions: BatchPositionStat[];
  frequentEvents: BatchMutationStat[];
  repeatedPositions: BatchPositionStat[];
  repeatedEvents: BatchMutationStat[];
}

export interface HistoryResultSummary {
  queryName: string;
  mutationSummary: string;
  mutationCount: number;
  alignmentScore: number;
  templateCoverage: number;
  warnings: string[];
}

export interface ComparisonHistoryEntry {
  id: string;
  createdAt: string;
  mode: Mode;
  templateType: TemplateType;
  template: SequenceInput;
  queries: SequenceInput[];
  colorRules: ColorRule[];
  templateLength: number;
  totalQueries: number;
  mutatedQueries: number;
  totalMutations: number;
  summaries: HistoryResultSummary[];
}
