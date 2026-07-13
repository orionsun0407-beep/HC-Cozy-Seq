import type { ColorRule, ComparisonResult } from '../types.ts';
import { colorForMutation, PRISM_COLORS, type PrismColor } from './colorRules.ts';

export interface MutationTableCell {
  event: string;
  position: number;
  color: PrismColor;
}

export interface MutationTableRow {
  queryName: string;
  mutations: MutationTableCell[];
}

function toArgb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`;
}

export function buildMutationTableRows(results: ComparisonResult[], rules: ColorRule[]): MutationTableRow[] {
  return results.map((result) => ({
    queryName: result.queryName.trim() || 'Query',
    mutations: [...result.mutations]
      .sort((left, right) => left.templatePosition - right.templatePosition || left.alignmentColumn - right.alignmentColumn)
      .map((mutation) => ({
        event: mutation.event,
        position: mutation.templatePosition,
        color: colorForMutation(mutation, rules),
      })),
  }));
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportMutationWorkbook(results: ComparisonResult[], rules: ColorRule[], filename: string): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const rows = buildMutationTableRows(results, rules);
  const mutationColumnCount = Math.max(1, ...rows.map((row) => row.mutations.length));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HC CozySeq';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Mutations', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
    properties: { defaultRowHeight: 22 },
  });

  const headers = ['Sequence name', ...Array.from({ length: mutationColumnCount }, (_, index) => `Mutation ${index + 1}`)];
  const headerRow = sheet.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F654C' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF244D3A' } } };
  });

  for (const row of rows) {
    const values = [row.queryName, ...(row.mutations.length ? row.mutations.map((mutation) => mutation.event) : ['No mutation'])];
    const worksheetRow = sheet.addRow(values);
    worksheetRow.height = 23;

    const nameCell = worksheetRow.getCell(1);
    nameCell.font = { bold: true, color: { argb: 'FF233129' } };
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8F3' } };
    nameCell.alignment = { vertical: 'middle', horizontal: 'left' };

    if (!row.mutations.length) {
      const cell = worksheetRow.getCell(2);
      const color = PRISM_COLORS.Gray;
      cell.font = { color: { argb: toArgb(color.text) }, italic: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(color.background) } };
      cell.border = { bottom: { style: 'thin', color: { argb: toArgb(color.border) } } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      continue;
    }

    row.mutations.forEach((mutation, index) => {
      const cell = worksheetRow.getCell(index + 2);
      cell.font = { bold: true, color: { argb: toArgb(mutation.color.text) } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(mutation.color.background) } };
      cell.border = {
        top: { style: 'thin', color: { argb: toArgb(mutation.color.border) } },
        bottom: { style: 'thin', color: { argb: toArgb(mutation.color.border) } },
        left: { style: 'thin', color: { argb: toArgb(mutation.color.border) } },
        right: { style: 'thin', color: { argb: toArgb(mutation.color.border) } },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  }

  sheet.getColumn(1).width = Math.min(42, Math.max(18, ...rows.map((row) => row.queryName.length + 3)));
  for (let column = 2; column <= mutationColumnCount + 1; column += 1) {
    const longestValue = Math.max(
      headers[column - 1].length,
      ...rows.map((row) => row.mutations[column - 2]?.event.length ?? (column === 2 && !row.mutations.length ? 11 : 0)),
    );
    sheet.getColumn(column).width = Math.min(28, Math.max(13, longestValue + 3));
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: mutationColumnCount + 1 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(
    new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}
