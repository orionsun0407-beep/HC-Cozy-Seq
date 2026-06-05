import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertStack } from './components/AlertStack';
import { BatchSummary } from './components/BatchSummary';
import { ComparisonOverview } from './components/ComparisonOverview';
import { ColorRulesCard } from './components/ColorRulesCard';
import { Hero } from './components/Hero';
import { HistoryPanel } from './components/HistoryPanel';
import { QuickGuide } from './components/QuickGuide';
import { ResultCard } from './components/ResultCard';
import { SequenceInputs } from './components/SequenceInputs';
import { sampleBlastxQueries, sampleQueries, sampleTemplateDna, sampleTemplateProtein } from './data/sampleData';
import type {
  AppAlert,
  BlastxTemplatePreset,
  ComparisonHistoryEntry,
  ComparisonResult,
  FastaRecord,
  Mode,
  SequenceInput,
  TemplateType,
} from './types';
import { DEFAULT_COLOR_RULES } from './utils/colorRules';
import { runBlastpStyleComparison, runBlastxStyleComparison } from './utils/comparison';
import { readFastaFiles, sanitizeSequence, SUPPORTED_SEQUENCE_EXTENSIONS } from './utils/fasta';
import {
  chooseAndBindHistoryFile,
  clearHistoryStorage,
  clearStoredHistoryFileHandle,
  createHistoryEntry,
  HISTORY_FILE_SUGGESTED_NAME,
  insertHistoryEntry,
  mergeHistoryEntries,
  parseHistoryFilePayload,
  readHistoryFromStorage,
  reconnectBoundHistoryFile,
  removeHistoryEntry,
  restoreBoundHistoryFile,
  serializeHistoryFilePayload,
  supportsHistoryFileBinding,
  writeHistoryToFileHandle,
  writeHistoryToStorage,
} from './utils/history';
import { detectSequenceType, validateDNASequence, validateProteinSequence } from './utils/sequence';
import { buildBatchStatistics } from './utils/statistics';

const TEMPLATE_ID = 'template';
const BLASTX_TEMPLATE_PRESETS_STORAGE_KEY = 'hc-cozyseq-blastx-template-presets-v1';

function makeAlert(tone: AppAlert['tone'], message: string): AppAlert {
  return { id: crypto.randomUUID(), tone, message };
}

function hasSequence(input: SequenceInput): boolean {
  return Boolean(sanitizeSequence(input.sequence).trim());
}

function normalizeName(name: string, fallback: string): string {
  return name.trim() || fallback;
}

function toFastaRecord(input: SequenceInput, fallback: string, trimTerminalStops = false): FastaRecord {
  return {
    name: normalizeName(input.name, fallback),
    sequence: sanitizeSequence(input.sequence, { trimTerminalStops }),
  };
}

function toDnaFastaRecord(input: SequenceInput, fallback: string): FastaRecord {
  const validation = validateDNASequence(input.sequence);
  return {
    name: normalizeName(input.name, fallback),
    sequence: validation.sequence,
  };
}

function isSingleEmptyDefaultQuery(queries: SequenceInput[]): boolean {
  return queries.length === 1 && !hasSequence(queries[0]) && (!queries[0].name || /^Query\s*1$/i.test(queries[0].name));
}

function isBlastxTemplatePreset(value: unknown): value is BlastxTemplatePreset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BlastxTemplatePreset>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.sequence === 'string' &&
    (candidate.templateType === 'Protein' || candidate.templateType === 'DNA') &&
    typeof candidate.updatedAt === 'string'
  );
}

function readBlastxTemplatePresetsFromStorage(): BlastxTemplatePreset[] {
  try {
    const raw = localStorage.getItem(BLASTX_TEMPLATE_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBlastxTemplatePreset);
  } catch {
    return [];
  }
}

function writeBlastxTemplatePresetsToStorage(presets: BlastxTemplatePreset[]): string | null {
  try {
    localStorage.setItem(BLASTX_TEMPLATE_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    return null;
  } catch {
    return '常用模板已更新，但浏览器本地存储写入失败；刷新后可能无法保留。';
  }
}

function fileExtensionsOk(files: FileList | File[] | null): boolean {
  if (!files?.length) return false;
  return Array.from(files).every((file) => SUPPORTED_SEQUENCE_EXTENSIONS.test(file.name));
}

function resolveBlastxTemplateType(
  template: SequenceInput,
  selectedType: TemplateType,
): {
  type: Exclude<TemplateType, 'Auto'> | null;
  alerts: AppAlert[];
} {
  const alerts: AppAlert[] = [];

  if (selectedType === 'Protein') {
    const validation = validateProteinSequence(template.sequence);
    if (!validation.valid) {
      alerts.push(makeAlert('error', `Template: ${validation.message ?? '蛋白质序列无效。'}`));
      return { type: null, alerts };
    }
    return { type: 'Protein', alerts };
  }

  if (selectedType === 'DNA') {
    const validation = validateDNASequence(template.sequence);
    if (!validation.valid) {
      alerts.push(makeAlert('error', `Template: ${validation.message ?? 'DNA/CDS 序列无效。'}`));
      return { type: null, alerts };
    }
    return { type: 'DNA', alerts };
  }

  const detection = detectSequenceType(template.sequence);
  if (detection.kind === 'protein') return { type: 'Protein', alerts };
  if (detection.kind === 'dna') return { type: 'DNA', alerts };

  if (detection.kind === 'ambiguous') {
    const dnaValidation = validateDNASequence(template.sequence);
    const proteinValidation = validateProteinSequence(template.sequence);
    if (dnaValidation.valid) {
      alerts.push(makeAlert('warning', 'BLASTX Auto 模板类型不明确，已按 DNA 尝试；如结果不符合预期，请手动选择 Protein。'));
      return { type: 'DNA', alerts };
    }
    if (proteinValidation.valid) {
      alerts.push(makeAlert('warning', 'BLASTX Auto 模板类型不明确，已按 Protein 尝试；如结果不符合预期，请手动选择 DNA。'));
      return { type: 'Protein', alerts };
    }
  }

  alerts.push(makeAlert('error', `Template: ${detection.reason} 请手动检查模板类型。`));
  return { type: null, alerts };
}

export default function App() {
  const toolRef = useRef<HTMLElement | null>(null);
  const guideRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<Mode>('BLASTP');
  const [templateType, setTemplateType] = useState<TemplateType>('Auto');
  const [template, setTemplate] = useState<SequenceInput>({
    id: TEMPLATE_ID,
    name: 'Template',
    sequence: sampleTemplateProtein,
  });
  const [blastxTemplatePresets, setBlastxTemplatePresets] = useState<BlastxTemplatePreset[]>(() => readBlastxTemplatePresetsFromStorage());
  const [selectedBlastxTemplatePresetId, setSelectedBlastxTemplatePresetId] = useState('');
  const [queries, setQueries] = useState<SequenceInput[]>(sampleQueries);
  const [colorRules, setColorRules] = useState(DEFAULT_COLOR_RULES);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [historyEntries, setHistoryEntries] = useState<ComparisonHistoryEntry[]>(() => readHistoryFromStorage());
  const [historyFileHandle, setHistoryFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [historyFileName, setHistoryFileName] = useState<string | null>(null);
  const [historyFileNeedsPermission, setHistoryFileNeedsPermission] = useState(false);
  const historyFileSupported = supportsHistoryFileBinding();

  const stats = useMemo(() => (results.length ? buildBatchStatistics(results) : null), [results]);

  const pushAlerts = (nextAlerts: AppAlert[]) => {
    if (nextAlerts.length) setAlerts((current) => [...nextAlerts, ...current].slice(0, 30));
  };

  const dismissAlert = (id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  };

  useEffect(() => {
    let cancelled = false;

    const hydrateBoundHistoryFile = async () => {
      const restored = await restoreBoundHistoryFile(readHistoryFromStorage());
      if (cancelled || !restored.handle) return;

      setHistoryFileHandle(restored.handle);
      setHistoryFileName(restored.fileName);
      setHistoryFileNeedsPermission(restored.needsPermission);

      if (restored.entries) {
        setHistoryEntries(restored.entries);
        const cacheError = writeHistoryToStorage(restored.entries);
        if (cacheError) {
          setAlerts((current) => [makeAlert('warning', cacheError), ...current].slice(0, 30));
        }
      }

      const warning = restored.warning;
      if (warning) {
        setAlerts((current) => [makeAlert('warning', warning), ...current].slice(0, 30));
      }
    };

    void hydrateBoundHistoryFile();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistHistory = async (nextResults: ComparisonResult[], activeQueries: SequenceInput[]) => {
    const entry = createHistoryEntry({
      mode,
      templateType,
      template,
      queries: activeQueries,
      colorRules,
      results: nextResults,
    });
    const nextHistory = insertHistoryEntry(historyEntries, entry);
    setHistoryEntries(nextHistory);
    const nextAlerts: AppAlert[] = [];
    const cacheError = writeHistoryToStorage(nextHistory);
    if (cacheError) nextAlerts.push(makeAlert('warning', cacheError));

    if (historyFileHandle) {
      const fileError = await writeHistoryToFileHandle(historyFileHandle, nextHistory);
      if (fileError) {
        setHistoryFileNeedsPermission(true);
        nextAlerts.push(makeAlert('warning', fileError));
      } else {
        setHistoryFileNeedsPermission(false);
      }
    }

    pushAlerts(nextAlerts);
  };

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode !== 'BLASTX') setSelectedBlastxTemplatePresetId('');
    setResults([]);
    pushAlerts([makeAlert('info', `${nextMode} mode selected.`)]);
  };

  const handleTemplateTypeChange = (nextType: TemplateType) => {
    setTemplateType(nextType);
    setSelectedBlastxTemplatePresetId('');
  };

  const handleTemplateChange = (nextTemplate: SequenceInput) => {
    setTemplate(nextTemplate);
    setSelectedBlastxTemplatePresetId('');
  };

  const handleBlastxTemplatePresetSelect = (id: string) => {
    setSelectedBlastxTemplatePresetId(id);
    if (!id) return;

    const preset = blastxTemplatePresets.find((item) => item.id === id);
    if (!preset) {
      pushAlerts([makeAlert('warning', '未找到这个常用模板。')]);
      return;
    }

    setTemplate({ id: TEMPLATE_ID, name: preset.name, sequence: preset.sequence });
    setTemplateType(preset.templateType);
    setResults([]);
    pushAlerts([makeAlert('success', `已载入常用模板：${preset.name}。`)]);
  };

  const handleSaveBlastxTemplatePreset = () => {
    if (mode !== 'BLASTX') return;

    if (!hasSequence(template)) {
      pushAlerts([makeAlert('error', '请输入模板序列后再保存常用模板。')]);
      return;
    }

    const resolved = resolveBlastxTemplateType(template, templateType);
    if (!resolved.type) {
      pushAlerts(resolved.alerts);
      return;
    }

    const name = normalizeName(template.name, 'Template');
    const sequence =
      resolved.type === 'Protein'
        ? sanitizeSequence(template.sequence, { trimTerminalStops: true })
        : sanitizeSequence(template.sequence);
    const existing =
      blastxTemplatePresets.find((preset) => preset.id === selectedBlastxTemplatePresetId) ??
      blastxTemplatePresets.find((preset) => preset.name.trim().toLowerCase() === name.toLowerCase());
    const nextPreset: BlastxTemplatePreset = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      sequence,
      templateType: resolved.type,
      updatedAt: new Date().toISOString(),
    };
    const nextPresets = existing
      ? blastxTemplatePresets.map((preset) => (preset.id === existing.id ? nextPreset : preset))
      : [nextPreset, ...blastxTemplatePresets];
    const storageError = writeBlastxTemplatePresetsToStorage(nextPresets);

    setBlastxTemplatePresets(nextPresets);
    setSelectedBlastxTemplatePresetId(nextPreset.id);
    setTemplate({ id: TEMPLATE_ID, name, sequence });
    setTemplateType(resolved.type);

    const status = existing ? `已更新常用模板：${name}。` : `已添加常用模板：${name}。`;
    pushAlerts([
      ...resolved.alerts,
      ...(storageError ? [makeAlert('warning', storageError)] : []),
      makeAlert('success', status),
    ]);
  };

  const handleDeleteBlastxTemplatePreset = () => {
    const preset = blastxTemplatePresets.find((item) => item.id === selectedBlastxTemplatePresetId);
    if (!preset) {
      pushAlerts([makeAlert('warning', '请选择一个常用模板再删除。')]);
      return;
    }

    const nextPresets = blastxTemplatePresets.filter((item) => item.id !== preset.id);
    const storageError = writeBlastxTemplatePresetsToStorage(nextPresets);
    setBlastxTemplatePresets(nextPresets);
    setSelectedBlastxTemplatePresetId('');
    pushAlerts([
      ...(storageError ? [makeAlert('warning', storageError)] : []),
      makeAlert('success', `已删除常用模板：${preset.name}。`),
    ]);
  };

  const loadSample = () => {
    if (mode === 'BLASTX') {
      setTemplate({ id: TEMPLATE_ID, name: 'Template CDS', sequence: sampleTemplateDna });
      setTemplateType('DNA');
      setQueries(sampleBlastxQueries);
    } else {
      setTemplate({ id: TEMPLATE_ID, name: 'Template', sequence: sampleTemplateProtein });
      setQueries(sampleQueries);
    }
    setSelectedBlastxTemplatePresetId('');
    setResults([]);
    pushAlerts([makeAlert('success', 'Sample dataset loaded.')]);
  };

  const clearInputs = () => {
    setTemplate({ id: TEMPLATE_ID, name: 'Template', sequence: '' });
    setQueries([{ id: crypto.randomUUID(), name: 'Query 1', sequence: '' }]);
    setSelectedBlastxTemplatePresetId('');
    setResults([]);
    pushAlerts([makeAlert('success', 'Input area cleared.')]);
  };

  const runComparison = () => {
    const nextAlerts: AppAlert[] = [];
    const activeQueries = queries.filter(hasSequence);

    if (!hasSequence(template)) {
      nextAlerts.push(makeAlert('error', '请输入模板序列。'));
    }

    if (!activeQueries.length) {
      nextAlerts.push(makeAlert('error', '请至少输入一个 Query 序列。'));
    }

    if (nextAlerts.length) {
      pushAlerts(nextAlerts);
      setResults([]);
      return;
    }

    if (mode === 'BLASTP') {
      const templateValidation = validateProteinSequence(template.sequence);
      if (!templateValidation.valid) {
        pushAlerts([makeAlert('error', `Template: ${templateValidation.message}`)]);
        setResults([]);
        return;
      }

      const queryErrors: AppAlert[] = [];
      const queryRecords: FastaRecord[] = [];
      activeQueries.forEach((query, index) => {
        const validation = validateProteinSequence(query.sequence);
        if (!validation.valid) {
          queryErrors.push(makeAlert('error', `${normalizeName(query.name, `Query ${index + 1}`)}: ${validation.message}`));
        } else {
          queryRecords.push(toFastaRecord(query, `Query ${index + 1}`, true));
        }
      });

      if (queryErrors.length) {
        pushAlerts(queryErrors);
        setResults([]);
        return;
      }

      const templateRecord = toFastaRecord(template, 'Template', true);
      const nextResults = queryRecords.map((query) => runBlastpStyleComparison(templateRecord, query));
      setResults(nextResults);
      void persistHistory(nextResults, activeQueries);
      pushAlerts([makeAlert('success', `Analyzed ${nextResults.length} query sequence${nextResults.length === 1 ? '' : 's'}.`)]);
      return;
    }

    const resolved = resolveBlastxTemplateType(template, templateType);
    nextAlerts.push(...resolved.alerts);
    if (!resolved.type) {
      pushAlerts(nextAlerts);
      setResults([]);
      return;
    }
    const resolvedType = resolved.type;

    const queryErrors: AppAlert[] = [];
    const queryRecords: FastaRecord[] = [];
    activeQueries.forEach((query, index) => {
      const validation = validateDNASequence(query.sequence);
      if (!validation.valid) {
        queryErrors.push(makeAlert('error', `${normalizeName(query.name, `Query ${index + 1}`)}: ${validation.message}`));
      } else {
        queryRecords.push({ name: normalizeName(query.name, `Query ${index + 1}`), sequence: validation.sequence });
      }
    });

    if (queryErrors.length) {
      pushAlerts([...nextAlerts, ...queryErrors]);
      setResults([]);
      return;
    }

    const templateRecord = resolvedType === 'Protein' ? toFastaRecord(template, 'Template', true) : toDnaFastaRecord(template, 'Template');
    const nextResults = queryRecords.map((query) => runBlastxStyleComparison(templateRecord, query, resolvedType));
    setResults(nextResults);
    void persistHistory(nextResults, activeQueries);
    pushAlerts([...nextAlerts, makeAlert('success', `Analyzed ${nextResults.length} translated query sequence${nextResults.length === 1 ? '' : 's'}.`)]);
  };

  const handleRestoreHistory = (entry: ComparisonHistoryEntry) => {
    setMode(entry.mode);
    setTemplateType(entry.templateType);
    setTemplate({ ...entry.template, id: TEMPLATE_ID });
    setQueries(entry.queries.length ? entry.queries.map((query) => ({ ...query })) : [{ id: crypto.randomUUID(), name: 'Query 1', sequence: '' }]);
    setColorRules(entry.colorRules.length ? entry.colorRules.map((rule) => ({ ...rule })) : DEFAULT_COLOR_RULES);
    setSelectedBlastxTemplatePresetId('');
    setResults([]);
    pushAlerts([makeAlert('success', `Restored local history snapshot from ${new Date(entry.createdAt).toLocaleString()}.`)]);
    toolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDeleteHistory = async (id: string) => {
    const nextHistory = removeHistoryEntry(historyEntries, id);
    setHistoryEntries(nextHistory);
    const nextAlerts: AppAlert[] = [];
    const cacheError = writeHistoryToStorage(nextHistory);
    if (cacheError) nextAlerts.push(makeAlert('warning', cacheError));
    if (historyFileHandle) {
      const fileError = await writeHistoryToFileHandle(historyFileHandle, nextHistory);
      if (fileError) {
        setHistoryFileNeedsPermission(true);
        nextAlerts.push(makeAlert('warning', fileError));
      } else {
        setHistoryFileNeedsPermission(false);
      }
    }
    pushAlerts(nextAlerts.length ? nextAlerts : [makeAlert('success', 'Removed one local history record.')]);
  };

  const handleClearHistory = async () => {
    setHistoryEntries([]);
    const nextAlerts: AppAlert[] = [];
    const cacheError = clearHistoryStorage();
    if (cacheError) nextAlerts.push(makeAlert('warning', cacheError));
    if (historyFileHandle) {
      const fileError = await writeHistoryToFileHandle(historyFileHandle, []);
      if (fileError) {
        setHistoryFileNeedsPermission(true);
        nextAlerts.push(makeAlert('warning', fileError));
      } else {
        setHistoryFileNeedsPermission(false);
      }
    }
    pushAlerts(nextAlerts.length ? nextAlerts : [makeAlert('success', 'Cleared local comparison history.')]);
  };

  const handleBindHistoryFile = async () => {
    if (historyFileHandle && historyFileNeedsPermission) {
      const reconnected = await reconnectBoundHistoryFile(historyFileHandle, historyEntries);
      if (!reconnected.granted) {
        if (reconnected.warning) pushAlerts([makeAlert('warning', reconnected.warning)]);
        return;
      }

      const nextHistory = reconnected.entries ?? historyEntries;
      setHistoryEntries(nextHistory);
      setHistoryFileNeedsPermission(false);
      const cacheError = writeHistoryToStorage(nextHistory);
      const nextAlerts = [makeAlert('success', `History file access restored: ${historyFileHandle.name}.`)];
      if (reconnected.warning) nextAlerts.unshift(makeAlert('warning', reconnected.warning));
      if (cacheError) nextAlerts.unshift(makeAlert('warning', cacheError));
      pushAlerts(nextAlerts);
      return;
    }

    const bound = await chooseAndBindHistoryFile(historyEntries);

    if (bound.cancelled) return;
    if (!bound.handle || !bound.entries) {
      if (bound.warning) pushAlerts([makeAlert('warning', bound.warning)]);
      return;
    }

    const mergedHistory = mergeHistoryEntries(bound.entries, historyEntries);
    setHistoryFileHandle(bound.handle);
    setHistoryFileName(bound.handle.name);
    setHistoryFileNeedsPermission(false);
    setHistoryEntries(mergedHistory);

    const cacheError = writeHistoryToStorage(mergedHistory);
    const nextAlerts = [
      makeAlert('success', `History file bound: ${bound.handle.name}. Future successful runs will be written to this file.`),
    ];
    if (bound.warning) nextAlerts.unshift(makeAlert('warning', bound.warning));
    if (cacheError) nextAlerts.unshift(makeAlert('warning', cacheError));
    pushAlerts(nextAlerts);
  };

  const handleUnbindHistoryFile = async () => {
    setHistoryFileHandle(null);
    setHistoryFileName(null);
    setHistoryFileNeedsPermission(false);
    const error = await clearStoredHistoryFileHandle();
    pushAlerts([makeAlert(error ? 'warning' : 'success', error ?? 'History file unbound. The app will keep using browser-local history.')]);
  };

  const handleExportHistoryFile = () => {
    if (!historyEntries.length) {
      pushAlerts([makeAlert('warning', '当前没有可导出的历史记录。')]);
      return;
    }

    try {
      const blob = new Blob([serializeHistoryFilePayload(historyEntries)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = HISTORY_FILE_SUGGESTED_NAME;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      pushAlerts([makeAlert('success', `History exported as ${HISTORY_FILE_SUGGESTED_NAME}.`)]);
    } catch {
      pushAlerts([makeAlert('error', '无法导出历史 JSON 文件。')]);
    }
  };

  const handleImportHistoryChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';

    if (!files.length) return;

    try {
      const raw = await files[0].text();
      const importedEntries = parseHistoryFilePayload(raw);

      if (!importedEntries.length) {
        pushAlerts([makeAlert('error', '未从 JSON 文件中解析到可用历史记录。')]);
        return;
      }

      const nextHistory = mergeHistoryEntries(importedEntries, historyEntries);
      setHistoryEntries(nextHistory);

      const nextAlerts: AppAlert[] = [];
      const cacheError = writeHistoryToStorage(nextHistory);
      if (cacheError) nextAlerts.push(makeAlert('warning', cacheError));

      if (historyFileHandle) {
        const fileError = await writeHistoryToFileHandle(historyFileHandle, nextHistory);
        if (fileError) {
          setHistoryFileNeedsPermission(true);
          nextAlerts.push(makeAlert('warning', fileError));
        } else {
          setHistoryFileNeedsPermission(false);
        }
      }

      nextAlerts.push(makeAlert('success', `Imported ${importedEntries.length} history records from ${files[0].name}.`));
      pushAlerts(nextAlerts);
    } catch {
      pushAlerts([makeAlert('error', '无法读取这个历史 JSON 文件。')]);
    }
  };

  const handleTemplateUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';

    if (!fileExtensionsOk(files)) {
      pushAlerts([makeAlert('error', 'Template upload 支持 FASTA、GenBank、EMBL、SnapGene 导出文本及常见 .dna/.seq 文件。')]);
      return;
    }

    const parsed = await readFastaFiles(files);
    const nextAlerts = [
      ...parsed.errors.map((message) => makeAlert('error', message)),
      ...parsed.warnings.map((message) => makeAlert('warning', message)),
    ];

    if (!parsed.records.length) {
      pushAlerts(nextAlerts.length ? nextAlerts : [makeAlert('error', '未解析到可用模板记录。')]);
      return;
    }

    const first = parsed.records[0];
    if (parsed.records.length > 1) {
      nextAlerts.push(makeAlert('warning', 'Template FASTA contains multiple records; using the first one.'));
    }

    if (mode === 'BLASTP') {
      const validation = validateProteinSequence(first.sequence);
      if (!validation.valid) {
        pushAlerts([...nextAlerts, makeAlert('error', `Template: ${validation.message}`)]);
        return;
      }
      setTemplate({ id: TEMPLATE_ID, name: first.name, sequence: validation.sequence });
    } else {
      const draftTemplate = { id: TEMPLATE_ID, name: first.name, sequence: first.sequence };
      const resolved = resolveBlastxTemplateType(draftTemplate, templateType);
      if (!resolved.type) {
        pushAlerts([...nextAlerts, ...resolved.alerts]);
        return;
      }
      const sequence =
        resolved.type === 'Protein'
          ? sanitizeSequence(first.sequence, { trimTerminalStops: true })
          : sanitizeSequence(first.sequence);
      setTemplate({ id: TEMPLATE_ID, name: first.name, sequence });
      nextAlerts.push(...resolved.alerts);
    }

    setSelectedBlastxTemplatePresetId('');
    setResults([]);
    pushAlerts([...nextAlerts, makeAlert('success', `Template loaded: ${first.name}.`)]);
  };

  const handleQueryUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';

    if (!fileExtensionsOk(files)) {
      pushAlerts([makeAlert('error', 'Query upload 支持 FASTA、GenBank、EMBL、SnapGene 导出文本及常见 .dna/.seq 文件。')]);
      return;
    }

    const parsed = await readFastaFiles(files);
    const nextAlerts = [
      ...parsed.errors.map((message) => makeAlert('error', message)),
      ...parsed.warnings.map((message) => makeAlert('warning', message)),
    ];
    const imported: SequenceInput[] = [];

    parsed.records.forEach((record) => {
      if (mode === 'BLASTP') {
        const validation = validateProteinSequence(record.sequence);
        if (!validation.valid) {
          nextAlerts.push(makeAlert('error', `${record.name}: ${validation.message}`));
          return;
        }
        imported.push({ id: crypto.randomUUID(), name: record.name, sequence: validation.sequence });
      } else {
        const validation = validateDNASequence(record.sequence);
        if (!validation.valid) {
          nextAlerts.push(makeAlert('error', `${record.name}: ${validation.message}`));
          return;
        }
        imported.push({ id: crypto.randomUUID(), name: record.name, sequence: validation.sequence });
      }
    });

    if (!imported.length) {
      pushAlerts(nextAlerts.length ? nextAlerts : [makeAlert('error', '未导入任何有效 Query 序列。')]);
      return;
    }

    const baseQueries = isSingleEmptyDefaultQuery(queries) ? [] : queries;
    const nextQueries = [...baseQueries, ...imported];
    setQueries(nextQueries);
    setResults([]);
    pushAlerts([
      ...nextAlerts,
      makeAlert('success', `Added ${imported.length} new query sequences. Total queries: ${nextQueries.length}.`),
    ]);
  };

  return (
    <div className="app-shell">
      <Hero toolRef={toolRef} guideRef={guideRef} />

      <main>
        <AlertStack alerts={alerts} onDismiss={dismissAlert} />

        <section className="workspace" ref={toolRef}>
          <div className="workspace__primary">
            <SequenceInputs
              mode={mode}
              templateType={templateType}
              template={template}
              blastxTemplatePresets={blastxTemplatePresets}
              selectedBlastxTemplatePresetId={selectedBlastxTemplatePresetId}
              queries={queries}
              onModeChange={handleModeChange}
              onTemplateTypeChange={handleTemplateTypeChange}
              onTemplateChange={handleTemplateChange}
              onBlastxTemplatePresetSelect={handleBlastxTemplatePresetSelect}
              onSaveBlastxTemplatePreset={handleSaveBlastxTemplatePreset}
              onDeleteBlastxTemplatePreset={handleDeleteBlastxTemplatePreset}
              onQueriesChange={setQueries}
              onTemplateUpload={handleTemplateUpload}
              onQueryUpload={handleQueryUpload}
              onRun={runComparison}
              onLoadSample={loadSample}
              onClear={clearInputs}
            />
          </div>
          <aside className="workspace__side">
            <ColorRulesCard rules={colorRules} onChange={setColorRules} />
            <HistoryPanel
              entries={historyEntries}
              fileBindingSupported={historyFileSupported}
              fileName={historyFileName}
              fileNeedsPermission={historyFileNeedsPermission}
              onRestore={handleRestoreHistory}
              onDelete={handleDeleteHistory}
              onClear={handleClearHistory}
              onBindFile={handleBindHistoryFile}
              onUnbindFile={handleUnbindHistoryFile}
              onImportChange={handleImportHistoryChange}
              onExportFile={handleExportHistoryFile}
            />
          </aside>
        </section>

        <BatchSummary stats={stats} rules={colorRules} />
        <ComparisonOverview
          results={results}
          rules={colorRules}
          onStatus={(message, ok = true) => pushAlerts([makeAlert(ok ? 'success' : 'error', message)])}
        />

        <section className="results-section" aria-label="Comparison results">
          {results.length ? (
            results.map((result) => (
              <ResultCard
                key={result.id}
                result={result}
                rules={colorRules}
                onCopyStatus={(message, ok = true) => pushAlerts([makeAlert(ok ? 'success' : 'error', message)])}
              />
            ))
          ) : (
            <div className="card empty-results">
              <h2>Results</h2>
              <p>Results will appear here after running BLASTP-style or BLASTX-style comparison.</p>
            </div>
          )}
        </section>

        <section ref={guideRef}>
          <QuickGuide toolRef={toolRef} />
        </section>
      </main>
    </div>
  );
}
