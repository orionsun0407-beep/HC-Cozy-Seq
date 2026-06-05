import type { AlignmentResult } from '../types';

const GAP_PENALTY = -5;

const CONSERVATIVE_GROUPS = ['AGST', 'DENQ', 'KRH', 'FILMVWY', 'CP', 'ILV'];
const SCORE_TABLE_SIZE = 91;
const SCORE_TABLE = new Int16Array(SCORE_TABLE_SIZE * SCORE_TABLE_SIZE).fill(-3);

function substitutionScore(templateAA: string, queryAA: string): number {
  if (templateAA === queryAA) return 4;
  if (templateAA === 'X' || queryAA === 'X') return 0;
  if (CONSERVATIVE_GROUPS.some((group) => group.includes(templateAA) && group.includes(queryAA))) {
    return 1;
  }
  return -3;
}

for (let templateCode = 0; templateCode < SCORE_TABLE_SIZE; templateCode += 1) {
  for (let queryCode = 0; queryCode < SCORE_TABLE_SIZE; queryCode += 1) {
    const templateAA = String.fromCharCode(templateCode);
    const queryAA = String.fromCharCode(queryCode);
    SCORE_TABLE[templateCode * SCORE_TABLE_SIZE + queryCode] = substitutionScore(templateAA, queryAA);
  }
}

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

function exactLocalAlignment(template: string, query: string): AlignmentResult | null {
  if (template === query) {
    return {
      alignedTemplate: template,
      alignedQuery: query,
      templateStart: 0,
      templateEnd: template.length,
      queryStart: 0,
      queryEnd: query.length,
      score: template.length * 4,
      matches: template.length,
      mismatches: 0,
      gaps: 0,
      alignedResidues: template.length,
      templateCoverage: 1,
      queryCoverage: 1,
    };
  }

  const queryStart = query.indexOf(template);
  if (queryStart >= 0) {
    return {
      alignedTemplate: template,
      alignedQuery: template,
      templateStart: 0,
      templateEnd: template.length,
      queryStart,
      queryEnd: queryStart + template.length,
      score: template.length * 4,
      matches: template.length,
      mismatches: 0,
      gaps: 0,
      alignedResidues: template.length,
      templateCoverage: 1,
      queryCoverage: template.length / query.length,
    };
  }

  const templateStart = template.indexOf(query);
  if (templateStart >= 0) {
    return {
      alignedTemplate: query,
      alignedQuery: query,
      templateStart,
      templateEnd: templateStart + query.length,
      queryStart: 0,
      queryEnd: query.length,
      score: query.length * 4,
      matches: query.length,
      mismatches: 0,
      gaps: 0,
      alignedResidues: query.length,
      templateCoverage: query.length / template.length,
      queryCoverage: 1,
    };
  }

  return null;
}

export function smithWaterman(template: string, query: string): AlignmentResult {
  if (!template || !query) return emptyAlignment();
  const exact = exactLocalAlignment(template, query);
  if (exact) return exact;

  const rows = template.length + 1;
  const cols = query.length + 1;
  let previousRow = new Int32Array(cols);
  let currentRow = new Int32Array(cols);
  const pointers = new Uint8Array(rows * cols);
  const templateCodes = new Uint16Array(template.length);
  const queryCodes = new Uint16Array(query.length);
  let maxScore = 0;
  let maxI = 0;
  let maxJ = 0;

  for (let i = 0; i < template.length; i += 1) {
    templateCodes[i] = template.charCodeAt(i);
  }
  for (let j = 0; j < query.length; j += 1) {
    queryCodes[j] = query.charCodeAt(j);
  }

  for (let i = 1; i < rows; i += 1) {
    currentRow.fill(0);
    const templateCode = templateCodes[i - 1];
    const tableOffset = templateCode < SCORE_TABLE_SIZE ? templateCode * SCORE_TABLE_SIZE : -1;

    for (let j = 1; j < cols; j += 1) {
      const index = i * cols + j;
      const queryCode = queryCodes[j - 1];
      const score =
        tableOffset >= 0 && queryCode < SCORE_TABLE_SIZE
          ? SCORE_TABLE[tableOffset + queryCode]
          : substitutionScore(template[i - 1], query[j - 1]);
      const diag = previousRow[j - 1] + score;
      const up = previousRow[j] + GAP_PENALTY;
      const left = currentRow[j - 1] + GAP_PENALTY;
      let best = 0;

      if (diag > best) best = diag;
      if (up > best) best = up;
      if (left > best) best = left;

      currentRow[j] = best;
      if (best === 0) {
        pointers[index] = 0;
      } else if (best === diag) {
        pointers[index] = 1;
      } else if (best === up) {
        pointers[index] = 2;
      } else {
        pointers[index] = 3;
      }

      if (best > maxScore) {
        maxScore = best;
        maxI = i;
        maxJ = j;
      }
    }

    const nextPrevious = previousRow;
    previousRow = currentRow;
    currentRow = nextPrevious;
  }

  if (maxScore <= 0) return emptyAlignment();

  const alignedTemplate: string[] = [];
  const alignedQuery: string[] = [];
  let i = maxI;
  let j = maxJ;

  while (i > 0 && j > 0) {
    const pointer = pointers[i * cols + j];
    if (pointer === 0) break;
    if (pointer === 1) {
      alignedTemplate.push(template[i - 1]);
      alignedQuery.push(query[j - 1]);
      i -= 1;
      j -= 1;
    } else if (pointer === 2) {
      alignedTemplate.push(template[i - 1]);
      alignedQuery.push('-');
      i -= 1;
    } else {
      alignedTemplate.push('-');
      alignedQuery.push(query[j - 1]);
      j -= 1;
    }
  }

  alignedTemplate.reverse();
  alignedQuery.reverse();

  const templateString = alignedTemplate.join('');
  const queryString = alignedQuery.join('');
  let matches = 0;
  let mismatches = 0;
  let gaps = 0;
  let alignedResidues = 0;
  let templateResidues = 0;
  let queryResidues = 0;

  for (let column = 0; column < templateString.length; column += 1) {
    const templateAA = templateString[column];
    const queryAA = queryString[column];
    if (templateAA !== '-') templateResidues += 1;
    if (queryAA !== '-') queryResidues += 1;

    if (templateAA === '-' || queryAA === '-') {
      gaps += 1;
      continue;
    }

    alignedResidues += 1;
    if (templateAA === queryAA) matches += 1;
    else mismatches += 1;
  }

  return {
    alignedTemplate: templateString,
    alignedQuery: queryString,
    templateStart: i,
    templateEnd: maxI,
    queryStart: j,
    queryEnd: maxJ,
    score: maxScore,
    matches,
    mismatches,
    gaps,
    alignedResidues,
    templateCoverage: templateResidues / template.length,
    queryCoverage: queryResidues / query.length,
  };
}
