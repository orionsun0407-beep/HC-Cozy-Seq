import type { BatchMutationStat, BatchPositionStat, BatchStatistics, ComparisonResult } from '../types';

function sortPositionStats(stats: BatchPositionStat[]): BatchPositionStat[] {
  return stats.sort((a, b) => b.count - a.count || a.position - b.position);
}

function sortMutationStats(stats: BatchMutationStat[]): BatchMutationStat[] {
  return stats.sort((a, b) => b.count - a.count || a.position - b.position || a.event.localeCompare(b.event));
}

export function buildBatchStatistics(results: ComparisonResult[]): BatchStatistics {
  const positionMap = new Map<number, Set<string>>();
  const eventMap = new Map<string, { position: number; queryNames: Set<string> }>();
  let totalMutations = 0;
  let mutatedQueries = 0;

  for (const result of results) {
    if (result.mutations.length) mutatedQueries += 1;
    totalMutations += result.mutations.length;

    const queryPositionsSeen = new Set<number>();
    for (const mutation of result.mutations) {
      queryPositionsSeen.add(mutation.templatePosition);

      if (!eventMap.has(mutation.event)) {
        eventMap.set(mutation.event, { position: mutation.templatePosition, queryNames: new Set() });
      }
      eventMap.get(mutation.event)?.queryNames.add(result.queryName);
    }

    for (const position of queryPositionsSeen) {
      if (!positionMap.has(position)) positionMap.set(position, new Set());
      positionMap.get(position)?.add(result.queryName);
    }
  }

  const frequentPositions = sortPositionStats(
    [...positionMap.entries()].map(([position, queryNames]) => ({
      position,
      count: queryNames.size,
      queryNames: [...queryNames].sort(),
    })),
  );

  const frequentEvents = sortMutationStats(
    [...eventMap.entries()].map(([event, value]) => ({
      event,
      position: value.position,
      count: value.queryNames.size,
      queryNames: [...value.queryNames].sort(),
    })),
  );

  return {
    totalQueries: results.length,
    mutatedQueries,
    totalMutations,
    frequentPositions,
    frequentEvents,
    repeatedPositions: frequentPositions.filter((stat) => stat.count >= 2),
    repeatedEvents: frequentEvents.filter((stat) => stat.count >= 2),
  };
}
