import type { ColorRule, ComparisonResult, Mutation } from '../types.ts';
import { colorForMutation } from './colorRules.ts';

export type OverviewMarkKind = 'substitution' | 'deletion' | 'insertion';

const WINDOW_CONTEXT = 6;
const WINDOW_CLUSTER_GAP = 8;
const MAX_FOCUS_WINDOWS = 6;

export interface OverviewMark {
  id: string;
  kind: OverviewMarkKind;
  position: number;
  endPosition: number;
  label: string;
  color: {
    background: string;
    border: string;
    text: string;
  };
}

export interface OverviewRow {
  id: string;
  queryName: string;
  mutationSummary: string;
  mutationCount: number;
  templateCoverage: number;
  alignmentScore: number;
  marks: OverviewMark[];
}

export interface OverviewRegionBand {
  id: string;
  start: number;
  end: number;
  color: string;
}

export interface OverviewModel {
  templateName: string;
  mode: 'BLASTP' | 'BLASTX';
  templateSequence: string;
  templateLength: number;
  rowCount: number;
  rows: OverviewRow[];
  positionCounts: number[];
  maxPositionCount: number;
  regionBands: OverviewRegionBand[];
  hasTemplateVariants: boolean;
  focusWindows: FocusWindow[];
}

export interface FocusWindowCell {
  position: number;
  char: string;
  mutation: Mutation | null;
  insertionLabels: string[];
  color: {
    background: string;
    border: string;
    text: string;
  } | null;
}

export interface FocusWindowRow {
  id: string;
  label: string;
  queryName?: string;
  coverage?: number;
  mutationCount: number;
  mutationLabels: string[];
  cells: FocusWindowCell[];
}

export interface FocusWindow {
  id: string;
  start: number;
  end: number;
  rows: FocusWindowRow[];
  hiddenRowCount: number;
  eventCount: number;
  queryCount: number;
  title: string;
}

function mutationKind(from: string, to: string): OverviewMarkKind {
  if (from === '-') return 'insertion';
  if (to === '-') return 'deletion';
  return 'substitution';
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start <= otherEnd && otherStart <= end;
}

function mostCommonTemplate(results: ComparisonResult[]): string {
  const counts = new Map<string, number>();
  for (const result of results) {
    counts.set(result.templateProteinUsed, (counts.get(result.templateProteinUsed) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? '';
}

function residueMapByTemplatePosition(result: ComparisonResult): Map<number, string> {
  const map = new Map<number, string>();
  let templateIndex = result.alignment.templateStart;

  for (let column = 0; column < result.alignment.alignedTemplate.length; column += 1) {
    const templateAA = result.alignment.alignedTemplate[column];
    const queryAA = result.alignment.alignedQuery[column];

    if (templateAA === '-') continue;

    const position = templateIndex + 1;
    map.set(position, queryAA === '-' ? '-' : queryAA);
    templateIndex += 1;
  }

  return map;
}

function mutationMapByTemplatePosition(result: ComparisonResult): Map<number, Mutation> {
  const map = new Map<number, Mutation>();

  for (const mutation of result.mutations) {
    if (mutation.from === '-') continue;
    const end = mutation.templateEndPosition ?? mutation.templatePosition;
    for (let position = mutation.templatePosition; position <= end; position += 1) {
      map.set(position, mutation);
    }
  }

  return map;
}

function buildFocusWindows(results: ComparisonResult[], templateName: string, templateSequence: string, rules: ColorRule[]): FocusWindow[] {
  if (!results.length || !templateSequence) return [];

  const templateLength = templateSequence.length;
  const rawEvents = results.flatMap((result) =>
    result.mutations.map((mutation) => ({
      result,
      mutation,
      start: Math.max(1, mutation.templatePosition),
      end: Math.max(mutation.templateEndPosition ?? mutation.templatePosition, mutation.templatePosition, 1),
    })),
  );

  if (!rawEvents.length) return [];

  rawEvents.sort((a, b) => a.start - b.start || a.end - b.end);

  const clusters: Array<{
    start: number;
    end: number;
    events: typeof rawEvents;
    queryNames: Set<string>;
  }> = [];

  rawEvents.forEach((event) => {
    const last = clusters.at(-1);
    if (last && event.start <= last.end + WINDOW_CLUSTER_GAP) {
      last.end = Math.max(last.end, event.end);
      last.events.push(event);
      last.queryNames.add(event.result.queryName);
      return;
    }

    clusters.push({
      start: event.start,
      end: event.end,
      events: [event],
      queryNames: new Set([event.result.queryName]),
    });
  });

  const selectedClusters = (clusters.length > MAX_FOCUS_WINDOWS ? [...clusters] : clusters)
    .sort((a, b) => b.queryNames.size - a.queryNames.size || b.events.length - a.events.length || a.start - b.start)
    .slice(0, MAX_FOCUS_WINDOWS)
    .sort((a, b) => a.start - b.start);

  return selectedClusters.map((cluster, index) => {
    const start = Math.max(1, cluster.start - WINDOW_CONTEXT);
    const end = Math.min(templateLength, cluster.end + WINDOW_CONTEXT);

    const rows = results
      .map<FocusWindowRow>((result) => {
        const windowMutations = result.mutations.filter((mutation) => {
          const mutationStart = Math.max(1, mutation.templatePosition);
          const mutationEnd = Math.max(mutation.templateEndPosition ?? mutation.templatePosition, mutation.templatePosition, 1);
          return overlaps(start, end, mutationStart, mutationEnd);
        });

        const residues = residueMapByTemplatePosition(result);
        const mutationByPosition = mutationMapByTemplatePosition(result);
        const insertionsByPosition = new Map<number, string[]>();

        windowMutations
          .filter((mutation) => mutation.from === '-')
          .forEach((mutation) => {
            const labels = insertionsByPosition.get(mutation.templatePosition) ?? [];
            labels.push(mutation.event);
            insertionsByPosition.set(mutation.templatePosition, labels);
          });

        const cells: FocusWindowCell[] = [];
        for (let position = start; position <= end; position += 1) {
          const mutation = mutationByPosition.get(position) ?? null;
          cells.push({
            position,
            char: residues.get(position) ?? templateSequence[position - 1] ?? '·',
            mutation,
            insertionLabels: insertionsByPosition.get(position) ?? [],
            color: mutation ? colorForMutation(mutation, rules) : null,
          });
        }

        return {
          id: result.id,
          label: result.queryName,
          queryName: result.queryName,
          coverage: result.metadata.templateCoverage,
          mutationCount: windowMutations.length,
          mutationLabels: windowMutations.map((mutation) => mutation.event),
          cells,
        };
      });

    const changedPositions = new Set(cluster.events.flatMap((event) => {
      const positions: number[] = [];
      for (let position = Math.max(1, event.mutation.templatePosition); position <= Math.max(event.mutation.templateEndPosition ?? event.mutation.templatePosition, event.mutation.templatePosition, 1); position += 1) {
        positions.push(position);
      }
      return positions;
    }));

    const templateCells: FocusWindowCell[] = [];
    for (let position = start; position <= end; position += 1) {
      const mutation = changedPositions.has(position)
        ? cluster.events.find((event) => overlaps(position, position, event.start, event.end))?.mutation ?? null
        : null;
      templateCells.push({
        position,
        char: templateSequence[position - 1] ?? '·',
        mutation,
        insertionLabels: [],
        color: mutation ? colorForMutation(mutation, rules) : null,
      });
    }

    return {
      id: `focus-${index + 1}`,
      start,
      end,
      rows: [
        {
          id: `template-${index + 1}`,
          label: templateName,
          mutationCount: cluster.events.length,
          mutationLabels: cluster.events.map((event) => event.mutation.event),
          cells: templateCells,
        } satisfies FocusWindowRow,
        ...rows,
      ],
      hiddenRowCount: 0,
      eventCount: cluster.events.length,
      queryCount: results.length,
      title: `Positions ${start}-${end}`,
    };
  });
}

export function buildOverviewModel(results: ComparisonResult[], rules: ColorRule[]): OverviewModel | null {
  if (!results.length) return null;

  const templateName = results[0].templateName;
  const mode = results[0].mode;
  const templateSequence = mostCommonTemplate(results);
  const templateLength = Math.max(
    ...results.map((result) =>
      Math.max(
        result.templateProteinUsed.length,
        ...result.mutations.map((mutation) => mutation.templateEndPosition ?? mutation.templatePosition),
        0,
      ),
    ),
    0,
  );
  const counts = Array.from({ length: Math.max(templateLength, 1) }, () => 0);
  const templateVariants = new Set(results.map((result) => result.templateProteinUsed));

  const rows: OverviewRow[] = results.map((result) => {
    const marks = result.mutations.map((mutation, index) => {
      const position = Math.max(mutation.templatePosition, 1);
      const endPosition = Math.max(mutation.templateEndPosition ?? position, position);
      const kind = mutationKind(mutation.from, mutation.to);

      if (kind === 'deletion') {
        for (let cursor = position; cursor <= endPosition && cursor <= counts.length; cursor += 1) counts[cursor - 1] += 1;
      } else if (position <= counts.length) {
        counts[position - 1] += 1;
      }

      return {
        id: `${result.id}-${mutation.event}-${index}`,
        kind,
        position,
        endPosition,
        label: mutation.event,
        color: colorForMutation(mutation, rules),
      };
    });

    return {
      id: result.id,
      queryName: result.queryName,
      mutationSummary: result.mutationSummary,
      mutationCount: result.mutations.length,
      templateCoverage: result.metadata.templateCoverage,
      alignmentScore: result.metadata.alignmentScore,
      marks,
    };
  });

  const regionBands = rules
    .map((rule) => ({
      id: rule.id,
      start: Math.max(1, rule.start),
      end: Math.min(rule.end ?? templateLength, templateLength),
      color: colorForMutation(
        {
          from: 'X',
          to: 'Y',
          templatePosition: rule.start,
          queryPosition: 1,
          alignmentColumn: 0,
          event: `${rule.start}`,
        },
        rules,
      ).background,
    }))
    .filter((band) => band.start <= templateLength && band.end >= band.start);

  return {
    templateName,
    mode,
    templateSequence,
    templateLength,
    rowCount: rows.length,
    rows,
    positionCounts: counts,
    maxPositionCount: Math.max(...counts, 0),
    regionBands,
    hasTemplateVariants: templateVariants.size > 1,
    focusWindows: buildFocusWindows(results, templateName, templateSequence, rules),
  };
}
