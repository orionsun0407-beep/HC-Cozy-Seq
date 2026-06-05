import type { AlignmentResult, Mutation } from '../types';

function deletionEvent(from: string, start: number, end: number): string {
  return start === end ? `${from}${start}del` : `Δ${start}-${end}del`;
}

export function extractMutations(alignment: AlignmentResult, fullTemplate = '', fullQuery = ''): Mutation[] {
  const mutations: Mutation[] = [];
  let templateIndex = alignment.templateStart;
  let queryIndex = alignment.queryStart;
  let pendingDeletion:
    | {
        from: string;
        templatePosition: number;
        templateEndPosition: number;
        queryPosition: number;
        alignmentColumn: number;
        alignmentEndColumn: number;
    }
    | null = null;
  let pendingInsertion:
    | {
        to: string;
        templatePosition: number;
        queryPosition: number;
        queryEndPosition: number;
        alignmentColumn: number;
        alignmentEndColumn: number;
        anchorResidue: string;
      }
    | null = null;

  const flushDeletion = () => {
    if (!pendingDeletion) return;
    const singleResidue = pendingDeletion.templatePosition === pendingDeletion.templateEndPosition;
    mutations.push({
      from: pendingDeletion.from,
      to: '-',
      templatePosition: pendingDeletion.templatePosition,
      templateEndPosition: pendingDeletion.templateEndPosition,
      queryPosition: pendingDeletion.queryPosition,
      alignmentColumn: pendingDeletion.alignmentColumn,
      alignmentEndColumn: pendingDeletion.alignmentEndColumn,
      event: deletionEvent(pendingDeletion.from, pendingDeletion.templatePosition, pendingDeletion.templateEndPosition),
    });
    pendingDeletion = null;
  };

  const flushInsertion = () => {
    if (!pendingInsertion) return;
    const isNTerminal = pendingInsertion.templatePosition <= 0;
    mutations.push({
      from: '-',
      to: pendingInsertion.to,
      templatePosition: Math.max(pendingInsertion.templatePosition, 1),
      queryPosition: pendingInsertion.queryPosition,
      queryEndPosition: pendingInsertion.queryEndPosition,
      alignmentColumn: pendingInsertion.alignmentColumn,
      alignmentEndColumn: pendingInsertion.alignmentEndColumn,
      event: isNTerminal
        ? `N-term-ins${pendingInsertion.to}`
        : `${pendingInsertion.anchorResidue || 'pos'}${pendingInsertion.templatePosition}ins${pendingInsertion.to}`,
    });
    pendingInsertion = null;
  };

  for (let column = 0; column < alignment.alignedTemplate.length; column += 1) {
    const templateAA = alignment.alignedTemplate[column];
    const queryAA = alignment.alignedQuery[column];
    const currentTemplatePosition = templateAA === '-' ? null : templateIndex + 1;
    const currentQueryPosition = queryAA === '-' ? null : queryIndex + 1;

    if (currentTemplatePosition === null && currentQueryPosition !== null && queryAA !== '-') {
      flushDeletion();
      if (!pendingInsertion) {
        pendingInsertion = {
          to: queryAA,
          templatePosition: templateIndex,
          queryPosition: currentQueryPosition,
          queryEndPosition: currentQueryPosition,
          alignmentColumn: column,
          alignmentEndColumn: column,
          anchorResidue: templateIndex > alignment.templateStart ? alignment.alignedTemplate.slice(0, column).replace(/-/g, '').slice(-1) : '',
        };
      } else {
        pendingInsertion.to += queryAA;
        pendingInsertion.queryEndPosition = currentQueryPosition;
        pendingInsertion.alignmentEndColumn = column;
      }
    } else {
      flushInsertion();
    }

    if (currentTemplatePosition !== null && queryAA === '-') {
      if (!pendingDeletion) {
        pendingDeletion = {
          from: templateAA,
          templatePosition: currentTemplatePosition,
          templateEndPosition: currentTemplatePosition,
          queryPosition: Math.max(queryIndex + 1, 1),
          alignmentColumn: column,
          alignmentEndColumn: column,
        };
      } else {
        pendingDeletion.from += templateAA;
        pendingDeletion.templateEndPosition = currentTemplatePosition;
        pendingDeletion.alignmentEndColumn = column;
      }
    } else {
      flushDeletion();
    }

    if (
      currentTemplatePosition !== null &&
      currentQueryPosition !== null &&
      templateAA !== queryAA &&
      queryAA !== '-'
    ) {
      mutations.push({
        from: templateAA,
        to: queryAA,
        templatePosition: currentTemplatePosition,
        queryPosition: currentQueryPosition,
        alignmentColumn: column,
        event: `${templateAA}${currentTemplatePosition}${queryAA}`,
      });
    }

    if (templateAA !== '-') templateIndex += 1;
    if (queryAA !== '-') queryIndex += 1;
  }

  flushInsertion();
  flushDeletion();

  if (fullQuery && alignment.queryStart > 0 && alignment.templateStart === 0) {
    const inserted = fullQuery.slice(0, alignment.queryStart);
    mutations.push({
      from: '-',
      to: inserted,
      templatePosition: 1,
      queryPosition: 1,
      queryEndPosition: alignment.queryStart,
      alignmentColumn: -1,
      alignmentEndColumn: -1,
      event: `N-term-ins${inserted}`,
    });
  }

  if (fullTemplate && fullQuery && alignment.queryEnd < fullQuery.length && alignment.templateEnd === fullTemplate.length) {
    const inserted = fullQuery.slice(alignment.queryEnd);
    const anchorPosition = Math.max(alignment.templateEnd, 1);
    const anchorResidue = fullTemplate[anchorPosition - 1] ?? 'C-term';
    mutations.push({
      from: '-',
      to: inserted,
      templatePosition: anchorPosition,
      queryPosition: alignment.queryEnd + 1,
      queryEndPosition: fullQuery.length,
      alignmentColumn: alignment.alignedQuery.length,
      alignmentEndColumn: alignment.alignedQuery.length,
      event: `${anchorResidue}${anchorPosition}ins${inserted}`,
    });
  }

  if (fullTemplate && alignment.templateStart > 0 && alignment.queryStart === 0) {
    const deleted = fullTemplate.slice(0, alignment.templateStart);
    mutations.push({
      from: deleted,
      to: '-',
      templatePosition: 1,
      templateEndPosition: alignment.templateStart,
      queryPosition: 1,
      alignmentColumn: -1,
      alignmentEndColumn: -1,
      event: deletionEvent(deleted, 1, alignment.templateStart),
    });
  }

  if (fullTemplate && fullQuery && alignment.templateEnd < fullTemplate.length && alignment.queryEnd === fullQuery.length) {
    const deleted = fullTemplate.slice(alignment.templateEnd);
    mutations.push({
      from: deleted,
      to: '-',
      templatePosition: alignment.templateEnd + 1,
      templateEndPosition: fullTemplate.length,
      queryPosition: Math.max(alignment.queryEnd, 1),
      alignmentColumn: alignment.alignedTemplate.length,
      alignmentEndColumn: alignment.alignedTemplate.length,
      event: deletionEvent(deleted, alignment.templateEnd + 1, fullTemplate.length),
    });
  }

  return mutations.sort((a, b) => a.templatePosition - b.templatePosition || a.alignmentColumn - b.alignmentColumn);
}

export function formatMutationSummary(queryName: string, mutations: Mutation[]): string {
  const label = queryName.trim() || 'Query';
  if (!mutations.length) return `${label}-No mutation`;
  return `${label}-${mutations.map((mutation) => mutation.event).join(',')}`;
}

export function mutationMapByQueryPosition(mutations: Mutation[]): Map<number, Mutation> {
  const map = new Map<number, Mutation>();
  for (const mutation of mutations.filter((item) => item.to !== '-')) {
    const end = mutation.queryEndPosition ?? mutation.queryPosition;
    for (let position = mutation.queryPosition; position <= end; position += 1) {
      map.set(position, mutation);
    }
  }
  return map;
}

export function mutationMapByTemplatePosition(mutations: Mutation[]): Map<number, Mutation> {
  const map = new Map<number, Mutation>();
  for (const mutation of mutations.filter((item) => item.from !== '-')) {
    const end = mutation.templateEndPosition ?? mutation.templatePosition;
    for (let position = mutation.templatePosition; position <= end; position += 1) {
      map.set(position, mutation);
    }
  }
  return map;
}

export function mutationMapByAlignmentColumn(mutations: Mutation[]): Map<number, Mutation> {
  const map = new Map<number, Mutation>();
  for (const mutation of mutations) {
    const end = mutation.alignmentEndColumn ?? mutation.alignmentColumn;
    for (let column = mutation.alignmentColumn; column <= end; column += 1) {
      map.set(column, mutation);
    }
  }
  return map;
}
