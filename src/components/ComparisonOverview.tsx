import { useMemo, useRef } from 'react';
import type { ColorRule, ComparisonResult } from '../types';
import { buildOverviewModel, type FocusWindow, type FocusWindowCell } from '../utils/overview';

interface ComparisonOverviewProps {
  results: ComparisonResult[];
  rules: ColorRule[];
  onStatus: (message: string, ok?: boolean) => void;
}

const SVG_STYLE = `
  .overview-root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .overview-title { font-size: 24px; font-weight: 800; fill: #233129; }
  .overview-subtitle { font-size: 13px; font-weight: 600; fill: #66756b; }
  .section-title { font-size: 14px; font-weight: 800; fill: #2a3b31; }
  .section-subtitle { font-size: 11px; font-weight: 600; fill: #6b766d; }
  .ruler-text { font-size: 11px; font-weight: 700; fill: #5f6e64; }
  .row-label { font-size: 13px; font-weight: 800; fill: #223028; }
  .seq-char { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 15px; fill: #18241d; }
  .ellipsis-text { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 15px; fill: #6d776f; }
  .note-text { font-size: 11px; font-weight: 600; fill: #44544b; }
  .muted-text { font-size: 11px; font-weight: 600; fill: #77857c; }
  .legend-text { font-size: 12px; font-weight: 600; fill: #5a6960; }
`;

const CELL_WIDTH = 18;
const ROW_HEIGHT = 28;
const LABEL_WIDTH_MIN = 126;
const LABEL_WIDTH_MAX = 360;
const NOTE_WIDTH = 188;
const SEGMENT_GAP = 34;
const LINE_MAX_PLOT_WIDTH = 1080;
const TOP_MARGIN = 82;
const LEFT_MARGIN = 18;

function summarizeLabels(labels: string[], max = 2): string {
  const unique = [...new Set(labels)];
  if (!unique.length) return '';
  if (unique.length <= max) return unique.join(', ');
  return `${unique.slice(0, max).join(', ')} +${unique.length - max}`;
}

function windowTicks(start: number, end: number): number[] {
  const length = end - start + 1;
  const step = length <= 24 ? 5 : 10;
  const ticks = new Set([start, end]);
  let next = Math.ceil(start / step) * step;
  while (next < end) {
    ticks.add(next);
    next += step;
  }
  return [...ticks].sort((a, b) => a - b);
}

function segmentWidth(segment: FocusWindow): number {
  return (segment.end - segment.start + 1) * CELL_WIDTH;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function serializeSvg(svg: SVGSVGElement): string {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);
  if (!source.includes('xmlns=')) {
    source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!source.includes('xmlns:xlink=')) {
    source = source.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  return source;
}

async function exportSvg(svg: SVGSVGElement, filename: string) {
  const source = serializeSvg(svg);
  downloadBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

async function exportPng(svg: SVGSVGElement, filename: string) {
  const source = serializeSvg(svg);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('failed to load svg'));
    image.src = url;
  });

  const width = Number(svg.getAttribute('width') ?? 1600);
  const height = Number(svg.getAttribute('height') ?? 1000);
  const scale = Math.max(window.devicePixelRatio || 1, 6);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const context = canvas.getContext('2d');
  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error('canvas unavailable');
  }

  context.scale(scale, scale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  URL.revokeObjectURL(url);
  if (!pngBlob) throw new Error('png export failed');
  downloadBlob(pngBlob, filename);
}

function renderCell(cell: FocusWindowCell, x: number, y: number, key: string) {
  const charY = y + 18;
  const title = [cell.mutation?.event, ...cell.insertionLabels].filter(Boolean).join(' · ');

  return (
    <g key={key}>
      {cell.color && (
        <rect
          x={x + 1}
          y={y + 4}
          width={CELL_WIDTH - 2}
          height={20}
          rx={4}
          fill={cell.color.background}
          stroke={cell.color.border}
        />
      )}
      {cell.insertionLabels.length > 0 && (
        <polygon
          points={`${x + CELL_WIDTH / 2},${y + 2} ${x + CELL_WIDTH / 2 + 5},${y + 10} ${x + CELL_WIDTH / 2 - 5},${y + 10}`}
          fill="#7a2434"
        />
      )}
      <text className="seq-char" x={x + CELL_WIDTH / 2} y={charY} textAnchor="middle" fill={cell.color?.text ?? undefined}>
        {cell.char}
        {title && <title>{title}</title>}
      </text>
    </g>
  );
}

function packSegments(segments: FocusWindow[]): FocusWindow[][] {
  if (!segments.length) return [];

  const lines: FocusWindow[][] = [];
  let currentLine: FocusWindow[] = [];
  let currentWidth = 0;

  for (const segment of segments) {
    const width = segmentWidth(segment);
    const addition = currentLine.length ? width + SEGMENT_GAP : width;

    if (currentLine.length && currentWidth + addition > LINE_MAX_PLOT_WIDTH) {
      lines.push(currentLine);
      currentLine = [segment];
      currentWidth = width;
      continue;
    }

    currentLine.push(segment);
    currentWidth += addition;
  }

  if (currentLine.length) lines.push(currentLine);
  return lines;
}

function aggregateRowNote(rowIndex: number, segments: FocusWindow[]): string {
  const labels = segments.flatMap((segment) => segment.rows[rowIndex]?.mutationLabels ?? []);
  return summarizeLabels(labels);
}

export function ComparisonOverview({ results, rules, onStatus }: ComparisonOverviewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const model = useMemo(() => buildOverviewModel(results, rules), [results, rules]);

  if (!model) {
    return (
      <section className="card overview-card" aria-labelledby="overview-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Work summary</p>
            <h2 id="overview-title">Comparison Overview</h2>
          </div>
        </div>
        <p className="empty-note">Run a comparison to generate a report-friendly overview figure.</p>
      </section>
    );
  }

  const segments = model.focusWindows;
  if (!segments.length) {
    return (
      <section className="card overview-card" aria-labelledby="overview-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Work summary</p>
            <h2 id="overview-title">Comparison Overview</h2>
          </div>
        </div>
        <p className="empty-note">This batch has no called mutation events, so there is no zoomed mutation overview to display.</p>
      </section>
    );
  }

  const lines = packSegments(segments);
  const rows = segments[0].rows;
  const labelWidth = Math.min(
    LABEL_WIDTH_MAX,
    Math.max(
      LABEL_WIDTH_MIN,
      ...rows.map((row) => row.label.length * 8.2 + 24),
    ),
  );
  const lineWidths = lines.map((line) =>
    line.reduce((total, segment, index) => total + segmentWidth(segment) + (index > 0 ? SEGMENT_GAP : 0), 0),
  );
  const plotWidth = Math.max(...lineWidths, 0);
  const svgWidth = Math.max(1100, LEFT_MARGIN * 2 + labelWidth + plotWidth + NOTE_WIDTH);

  let currentY = TOP_MARGIN;
  const lineGroups = lines.map((line, lineIndex) => {
    const lineHeight = 28 + 26 + rows.length * ROW_HEIGHT + 14;
    const groupY = currentY;
    currentY += lineHeight + 20;
    return { line, lineIndex, y: groupY, height: lineHeight };
  });
  const legendY = currentY + 4;
  const svgHeight = legendY + 36;

  const exportBaseName = `hc-cozyseq-overview-${model.mode.toLowerCase()}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;

  const handleSaveSvg = async () => {
    if (!svgRef.current) return;
    try {
      await exportSvg(svgRef.current, `${exportBaseName}.svg`);
      onStatus('Overview figure saved as SVG.', true);
    } catch {
      onStatus('Failed to save overview SVG.', false);
    }
  };

  const handleSavePng = async () => {
    if (!svgRef.current) return;
    try {
      await exportPng(svgRef.current, `${exportBaseName}.png`);
      onStatus('Overview figure saved as PNG.', true);
    } catch {
      onStatus('Failed to save overview PNG.', false);
    }
  };

  return (
    <section className="card overview-card" aria-labelledby="overview-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Work summary</p>
          <h2 id="overview-title">Comparison Overview</h2>
        </div>
        <div className="tool-actions">
          <button className="button button--ghost button--small" type="button" onClick={handleSaveSvg}>
            Save SVG
          </button>
          <button className="button button--ghost button--small" type="button" onClick={handleSavePng}>
            Save PNG
          </button>
        </div>
      </div>

      <div className="overview-meta">
        <p>
          {model.templateName} · {model.mode} · {model.rowCount} queries · template length {model.templateLength} aa
        </p>
      </div>

      {model.hasTemplateVariants && (
        <div className="inline-warning">
          <p>BLASTX run selected more than one translated template ORF across queries; compare row positions with that in mind.</p>
        </div>
      )}

      <div className="overview-figure-shell">
        <svg
          ref={svgRef}
          className="overview-figure"
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label="Combined mutation overview"
        >
          <style>{SVG_STYLE}</style>
          <rect width={svgWidth} height={svgHeight} fill="#ffffff" />
          <g className="overview-root">
            <text className="overview-title" x={LEFT_MARGIN} y={34}>
              HC CozySeq Mutation Overview
            </text>
            <text className="overview-subtitle" x={LEFT_MARGIN} y={54}>
              {model.templateName} · {model.mode} · {model.rowCount} queries · combined mutation-focused alignment figure
            </text>

            {lineGroups.map(({ line, lineIndex, y, height }) => {
              let segmentCursor = LEFT_MARGIN + labelWidth;

              return (
                <g key={`line-${lineIndex}`} transform={`translate(0, ${y})`}>
                  <rect x={LEFT_MARGIN} y={0} width={svgWidth - LEFT_MARGIN * 2} height={height} rx={10} fill="#fbfcf8" stroke="#dfe7dc" />
                  <text className="section-title" x={LEFT_MARGIN + 14} y={22}>
                    {line.length === 1
                      ? `Mutation window ${line[0].start}-${line[0].end}`
                      : `Combined mutation windows ${line[0].start}-${line[line.length - 1].end}`}
                  </text>
                  <text className="section-subtitle" x={LEFT_MARGIN + 14} y={40}>
                    Actual residues are shown for template and all query sequences in one figure.
                  </text>

                  {line.map((segment, segmentIndex) => {
                    const width = segmentWidth(segment);
                    const segmentX = segmentCursor;
                    const ticks = windowTicks(segment.start, segment.end);
                    segmentCursor += width + SEGMENT_GAP;

                    return (
                      <g key={segment.id}>
                        {ticks.map((tick) => {
                          const tickX = segmentX + (tick - segment.start) * CELL_WIDTH + CELL_WIDTH / 2;
                          return (
                            <g key={`${segment.id}-tick-${tick}`}>
                              <text className="ruler-text" x={tickX} y={60} textAnchor="middle">
                                {tick}
                              </text>
                              <line x1={tickX} y1={64} x2={tickX} y2={72} stroke="#8aa49a" />
                            </g>
                          );
                        })}

                        {rows.map((row, rowIndex) => {
                          const sourceRow = segment.rows[rowIndex];
                          const rowY = 80 + rowIndex * ROW_HEIGHT;
                          const charY = rowY + 18;
                          const note = aggregateRowNote(rowIndex, line);

                          return (
                            <g key={`${segment.id}-${row.id}`}>
                              {segmentIndex === 0 && (
                                <>
                                  <rect
                                    x={LEFT_MARGIN + 8}
                                    y={rowY - 4}
                                    width={svgWidth - LEFT_MARGIN * 2 - 16}
                                    height={ROW_HEIGHT - 2}
                                    rx={6}
                                    fill={rowIndex % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(246,248,243,0.9)'}
                                  />
                                  <text className="row-label" x={LEFT_MARGIN + 16} y={charY}>
                                    {row.label}
                                  </text>
                                  {note && (
                                    <text className="note-text" x={LEFT_MARGIN + labelWidth + plotWidth + 18} y={charY}>
                                      {note}
                                    </text>
                                  )}
                                </>
                              )}

                              {sourceRow.cells.map((cell, cellIndex) =>
                                renderCell(cell, segmentX + cellIndex * CELL_WIDTH, rowY, `${segment.id}-${row.id}-${cell.position}`),
                              )}
                            </g>
                          );
                        })}

                        {segmentIndex < line.length - 1 &&
                          rows.map((row, rowIndex) => {
                            const rowY = 80 + rowIndex * ROW_HEIGHT + 18;
                            const ellipsisX = segmentX + width + SEGMENT_GAP / 2;
                            return (
                              <text
                                key={`${segment.id}-${row.id}-ellipsis`}
                                className="ellipsis-text"
                                x={ellipsisX}
                                y={rowY}
                                textAnchor="middle"
                              >
                                ...
                              </text>
                            );
                          })}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            <g transform={`translate(${LEFT_MARGIN}, ${legendY})`}>
              <g>
                <rect x={0} y={4} width={16} height={20} rx={4} fill="#e8ece8" stroke="#bdc7bf" />
                <text className="seq-char" x={8} y={19} textAnchor="middle" fill="#3f4b44">R</text>
                <text className="legend-text" x={26} y={18}>Substitution</text>
              </g>
              <g transform="translate(170, 0)">
                <rect x={0} y={4} width={16} height={20} rx={4} fill="#e8ece8" stroke="#bdc7bf" />
                <text className="seq-char" x={8} y={19} textAnchor="middle" fill="#3f4b44">-</text>
                <text className="legend-text" x={26} y={18}>Deletion</text>
              </g>
              <g transform="translate(310, 0)">
                <rect x={0} y={4} width={16} height={20} rx={4} fill="#e8ece8" stroke="#bdc7bf" />
                <polygon points="8,0 13,8 3,8" fill="#7a2434" />
                <text className="seq-char" x={8} y={19} textAnchor="middle" fill="#3f4b44">A</text>
                <text className="legend-text" x={26} y={18}>Insertion anchor</text>
              </g>
            </g>
          </g>
        </svg>
      </div>
    </section>
  );
}
