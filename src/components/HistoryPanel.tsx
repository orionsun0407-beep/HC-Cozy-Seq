import { useRef, type ChangeEvent } from 'react';
import type { ComparisonHistoryEntry } from '../types';

interface HistoryPanelProps {
  entries: ComparisonHistoryEntry[];
  fileBindingSupported: boolean;
  fileName: string | null;
  fileNeedsPermission: boolean;
  onRestore: (entry: ComparisonHistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onBindFile: () => void;
  onUnbindFile: () => void;
  onImportChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onExportFile: () => void;
}

function formatTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function HistoryPanel({
  entries,
  fileBindingSupported,
  fileName,
  fileNeedsPermission,
  onRestore,
  onDelete,
  onClear,
  onBindFile,
  onUnbindFile,
  onImportChange,
  onExportFile,
}: HistoryPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const fileButtonLabel = fileName ? (fileNeedsPermission ? 'Allow file access' : 'Rebind file') : 'Bind history file';
  const note = fileName
    ? `当前会同步到本地文件：${fileName}${fileNeedsPermission ? '（需要重新授权后才能继续读写）' : ''}`
    : fileBindingSupported
      ? '当前保存在浏览器本地。也可以绑定同目录 JSON 文件，让历史自动写入本地文件。'
      : '当前仅保存在浏览器本地。此浏览器暂不支持自动写入本地历史文件，可改用 JSON 导入/导出。';

  return (
    <section className="card history-card" aria-labelledby="history-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Local history</p>
          <h2 id="history-title">Comparison History</h2>
        </div>
      </div>

      <p className="history-note">{note}</p>

      <div className="history-toolbar">
        <button className="button button--ghost button--small" type="button" onClick={onExportFile}>
          Export JSON
        </button>
        <button className="button button--ghost button--small" type="button" onClick={() => importInputRef.current?.click()}>
          Import JSON
        </button>
        {fileBindingSupported && (
          <button className="button button--ghost button--small" type="button" onClick={onBindFile}>
            {fileButtonLabel}
          </button>
        )}
        {fileName && (
          <button className="button button--ghost button--small" type="button" onClick={onUnbindFile}>
            Unbind file
          </button>
        )}
        {entries.length > 0 && (
          <button className="button button--ghost button--small" type="button" onClick={onClear}>
            Clear history
          </button>
        )}
      </div>
      <input ref={importInputRef} hidden type="file" accept="application/json,.json" onChange={onImportChange} />

      {entries.length ? (
        <div className="history-list">
          {entries.map((entry) => (
            <article className="history-item" key={entry.id}>
              <div className="history-item__top">
                <div>
                  <p className="history-time">{formatTime(entry.createdAt)}</p>
                  <h3>
                    {entry.template.name || 'Template'} · {entry.totalQueries} queries
                  </h3>
                </div>
                <div className="badge-row">
                  <span>{entry.mode}</span>
                  <span>Template {entry.templateType}</span>
                  <span>{entry.mutatedQueries} mutated</span>
                  <span>{entry.totalMutations} events</span>
                </div>
              </div>

              <div className="history-stats">
                <span>Template length {entry.templateLength || 'n/a'} aa</span>
                <span>{entry.queries.length} query records saved</span>
              </div>

              <div className="history-summary-list">
                {entry.summaries.slice(0, 4).map((summary) => (
                  <p key={`${entry.id}-${summary.queryName}`}>
                    <strong>{summary.queryName}</strong>: {summary.mutationSummary} · {Math.round(summary.templateCoverage * 100)}% cov
                  </p>
                ))}
                {entry.summaries.length > 4 && <p>+{entry.summaries.length - 4} more query summaries</p>}
              </div>

              <div className="history-actions">
                <button className="button button--small" type="button" onClick={() => onRestore(entry)}>
                  Restore to tool
                </button>
                <button className="button button--ghost button--small" type="button" onClick={() => onDelete(entry.id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-note">Your successful comparison runs will appear here automatically.</p>
      )}
    </section>
  );
}
