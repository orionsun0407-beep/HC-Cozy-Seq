import type { ChangeEvent } from 'react';
import type { BlastxTemplatePreset, Mode, SequenceInput, TemplateType } from '../types';
import { ModeToggle } from './ModeToggle';

interface SequenceInputsProps {
  mode: Mode;
  templateType: TemplateType;
  template: SequenceInput;
  blastxTemplatePresets: BlastxTemplatePreset[];
  selectedBlastxTemplatePresetId: string;
  queries: SequenceInput[];
  onModeChange: (mode: Mode) => void;
  onTemplateTypeChange: (type: TemplateType) => void;
  onTemplateChange: (template: SequenceInput) => void;
  onBlastxTemplatePresetSelect: (id: string) => void;
  onSaveBlastxTemplatePreset: () => void;
  onDeleteBlastxTemplatePreset: () => void;
  onQueriesChange: (queries: SequenceInput[]) => void;
  onTemplateUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onQueryUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRun: () => void;
  onLoadSample: () => void;
  onClear: () => void;
}

export function SequenceInputs({
  mode,
  templateType,
  template,
  blastxTemplatePresets,
  selectedBlastxTemplatePresetId,
  queries,
  onModeChange,
  onTemplateTypeChange,
  onTemplateChange,
  onBlastxTemplatePresetSelect,
  onSaveBlastxTemplatePreset,
  onDeleteBlastxTemplatePreset,
  onQueriesChange,
  onTemplateUpload,
  onQueryUpload,
  onRun,
  onLoadSample,
  onClear,
}: SequenceInputsProps) {
  const updateQuery = (id: string, patch: Partial<SequenceInput>) => {
    onQueriesChange(queries.map((query) => (query.id === id ? { ...query, ...patch } : query)));
  };

  const addQuery = () => {
    onQueriesChange([...queries, { id: crypto.randomUUID(), name: `Query ${queries.length + 1}`, sequence: '' }]);
  };

  const removeQuery = (id: string) => {
    const next = queries.filter((query) => query.id !== id);
    onQueriesChange(next.length ? next : [{ id: crypto.randomUUID(), name: 'Query 1', sequence: '' }]);
  };

  return (
    <section className="card tool-card" aria-labelledby="tool-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Analysis workspace</p>
          <h2 id="tool-title">Sequence Comparison</h2>
        </div>
        <div className="tool-actions">
          <button className="button button--ghost" type="button" onClick={onClear}>
            Clear
          </button>
          <button className="button button--ghost" type="button" onClick={onLoadSample}>
            Load sample
          </button>
        </div>
      </div>

      <div className="mode-row">
        <ModeToggle mode={mode} onChange={onModeChange} />
        {mode === 'BLASTX' && (
          <label className="field field--compact">
            <span>Template type</span>
            <select value={templateType} onChange={(event) => onTemplateTypeChange(event.target.value as TemplateType)}>
              <option value="Auto">Auto</option>
              <option value="Protein">Protein</option>
              <option value="DNA">DNA</option>
            </select>
          </label>
        )}
        {mode === 'BLASTX' && (
          <div className="template-presets" aria-label="BLASTX common templates">
            <label className="field template-presets__select">
              <span>Common template</span>
              <select value={selectedBlastxTemplatePresetId} onChange={(event) => onBlastxTemplatePresetSelect(event.target.value)}>
                <option value="">{blastxTemplatePresets.length ? 'Select saved template' : 'No saved templates'}</option>
                {blastxTemplatePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} · {preset.templateType}
                  </option>
                ))}
              </select>
            </label>
            <div className="template-presets__actions">
              <button className="button button--small button--secondary" type="button" onClick={onSaveBlastxTemplatePreset}>
                Save current
              </button>
              <button
                className="button button--small button--ghost"
                type="button"
                onClick={onDeleteBlastxTemplatePreset}
                disabled={!selectedBlastxTemplatePresetId}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="upload-row" aria-label="FASTA upload controls">
        <label className="file-button">
          <input
            type="file"
            accept=".fasta,.fas,.fa,.mpfa,.faa,.pep,.aa,.fna,.ffn,.frn,.cds,.nt,.fastq,.fq,.txt,.seq,.gb,.gbk,.genbank,.embl,.dna,.ape"
            onChange={onTemplateUpload}
          />
          Upload Template FASTA / Sequence
        </label>
        <label className="file-button">
          <input
            type="file"
            accept=".fasta,.fas,.fa,.mpfa,.faa,.pep,.aa,.fna,.ffn,.frn,.cds,.nt,.fastq,.fq,.txt,.seq,.gb,.gbk,.genbank,.embl,.dna,.ape"
            multiple
            onChange={onQueryUpload}
          />
          Upload Query FASTA / Sequence
        </label>
      </div>

      <div className="sequence-area">
        <div className="sequence-row sequence-row--template">
          <label className="field">
            <span>Template name</span>
            <input
              value={template.name}
              onChange={(event) => onTemplateChange({ ...template, name: event.target.value })}
              placeholder="Template"
            />
          </label>
          <label className="field field--sequence">
            <span>{mode === 'BLASTP' ? 'Template protein sequence' : 'Template protein or DNA/CDS sequence'}</span>
            <textarea
              value={template.sequence}
              onChange={(event) => onTemplateChange({ ...template, sequence: event.target.value })}
              spellCheck={false}
              rows={8}
              placeholder="Paste plain sequence or FASTA"
            />
          </label>
        </div>

        <div className="query-list">
          <div className="query-list__top">
            <h3>Queries</h3>
            <button className="button button--small" type="button" onClick={addQuery}>
              Add Query
            </button>
          </div>

          {queries.map((query, index) => (
            <div className="sequence-row query-row" key={query.id}>
              <div className="query-side">
                <div className="query-title">
                  <span>Query {index + 1}</span>
                  {queries.length > 1 && (
                    <button className="icon-button" type="button" onClick={() => removeQuery(query.id)} aria-label={`Remove ${query.name}`}>
                      ×
                    </button>
                  )}
                </div>
                <label className="field">
                  <span>Name</span>
                  <input value={query.name} onChange={(event) => updateQuery(query.id, { name: event.target.value })} placeholder="F2" />
                </label>
              </div>
              <label className="field field--sequence query-sequence-field">
                <span>{mode === 'BLASTP' ? 'Query protein sequence' : 'Query DNA/CDS sequence'}</span>
                <textarea
                  value={query.sequence}
                  onChange={(event) => updateQuery(query.id, { sequence: event.target.value })}
                  spellCheck={false}
                  rows={8}
                  placeholder="Paste plain sequence or FASTA"
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="run-row">
        <p>Runs locally in your browser. No BLAST or NCBI service is called.</p>
        <button className="button button--primary" type="button" onClick={onRun}>
          Run comparison
        </button>
      </div>
    </section>
  );
}
