import { useMemo, useRef, useState } from 'react';
import { AGENTS } from '../lib/agents';
import { DEFAULT_MODEL, MODELS, PROVIDERS, type Provider } from '../lib/providers';
import {
  extractTemplateVariables,
  type ImportSavedPromptsResult,
  type SavedPromptDraft,
  type SavedPromptTemplate,
} from '../lib/savedPrompts';

interface PromptLibraryProps {
  prompts: SavedPromptTemplate[];
  currentDraft: SavedPromptDraft;
  onCreatePrompt: (draft: SavedPromptDraft) => void;
  onUpdatePrompt: (id: string, draft: SavedPromptDraft) => void;
  onDuplicatePrompt: (id: string) => void;
  onDeletePrompt: (id: string) => void;
  onLoadPrompt: (prompt: SavedPromptTemplate, variables: Record<string, string>) => void;
  onBoostPrompt: (prompt: SavedPromptTemplate, variables: Record<string, string>) => void;
  onCopyPrompt: (prompt: SavedPromptTemplate, variables: Record<string, string>) => Promise<void>;
  onImportPrompts: (jsonText: string) => ImportSavedPromptsResult;
  onExportPrompts: () => void;
}

interface PromptFormState {
  title: string;
  body: string;
  tags: string;
  notes: string;
  provider: Provider;
  model: string;
  agent: SavedPromptDraft['agent'];
  customBoostInstructions: string;
}

type EditorState =
  | { mode: 'create'; form: PromptFormState }
  | { mode: 'edit'; promptId: string; form: PromptFormState };

function toFormState(draft: SavedPromptDraft): PromptFormState {
  return {
    ...draft,
    tags: draft.tags.join(', '),
  };
}

function toDraft(form: PromptFormState): SavedPromptDraft {
  return {
    ...form,
    tags: form.tags.split(','),
  };
}

function getPromptTimestamp(prompt: SavedPromptTemplate): number {
  return Date.parse(prompt.lastUsedAt ?? prompt.updatedAt) || 0;
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Never used';
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function PromptLibrary({
  prompts,
  currentDraft,
  onCreatePrompt,
  onUpdatePrompt,
  onDuplicatePrompt,
  onDeletePrompt,
  onLoadPrompt,
  onBoostPrompt,
  onCopyPrompt,
  onImportPrompts,
  onExportPrompts,
}: PromptLibraryProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, Record<string, string>>>({});
  const [copyStatusId, setCopyStatusId] = useState<string | null>(null);
  const [libraryMessage, setLibraryMessage] = useState('');

  const filteredPrompts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...prompts].sort((a, b) => getPromptTimestamp(b) - getPromptTimestamp(a));

    if (!query) {
      return sorted;
    }

    return sorted.filter(prompt => {
      const searchable = [
        prompt.title,
        prompt.body,
        prompt.notes,
        prompt.provider,
        prompt.model,
        prompt.agent,
        ...prompt.tags,
      ].join(' ').toLowerCase();

      return searchable.includes(query);
    });
  }, [prompts, search]);

  function openCreateEditor(draft: SavedPromptDraft = currentDraft) {
    setEditor({ mode: 'create', form: toFormState(draft) });
    setLibraryMessage('');
  }

  function openEditEditor(prompt: SavedPromptTemplate) {
    setEditor({ mode: 'edit', promptId: prompt.id, form: toFormState(prompt) });
    setLibraryMessage('');
  }

  function updateEditorForm(patch: Partial<PromptFormState>) {
    setEditor(prev => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));
  }

  function handleEditorProviderChange(provider: Provider) {
    updateEditorForm({ provider, model: DEFAULT_MODEL[provider] });
  }

  function submitEditor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !editor.form.body.trim() || !editor.form.model.trim()) {
      return;
    }

    const draft = toDraft(editor.form);
    if (editor.mode === 'edit') {
      onUpdatePrompt(editor.promptId, draft);
      setLibraryMessage('Prompt updated.');
    } else {
      onCreatePrompt(draft);
      setLibraryMessage('Prompt saved.');
    }

    setEditor(null);
  }

  function updateVariable(promptId: string, variable: string, value: string) {
    setVariableValues(prev => ({
      ...prev,
      [promptId]: {
        ...(prev[promptId] ?? {}),
        [variable]: value,
      },
    }));
  }

  async function copyPrompt(prompt: SavedPromptTemplate) {
    try {
      await onCopyPrompt(prompt, variableValues[prompt.id] ?? {});
      setCopyStatusId(prompt.id);
      window.setTimeout(() => setCopyStatusId(null), 1600);
    } catch {
      setLibraryMessage('Clipboard permission denied.');
    }
  }

  function importPrompts(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = loadEvent => {
      const result = onImportPrompts(String(loadEvent.target?.result ?? ''));
      setLibraryMessage(
        result.importedCount > 0
          ? `Imported ${result.importedCount} prompt${result.importedCount === 1 ? '' : 's'}.`
          : 'No valid prompts found in that file.'
      );
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  return (
    <aside className="prompt-library" aria-label="Saved prompt library">
      <div className="library-header">
        <div>
          <h2>Saved prompts</h2>
          <p>{prompts.length} reusable template{prompts.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn-primary" onClick={() => openCreateEditor()} disabled={!currentDraft.body.trim()}>
          Save current
        </button>
      </div>

      <div className="library-toolbar">
        <input
          className="library-search"
          type="search"
          placeholder="Search prompts, tags, models..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <div className="library-actions">
          <button className="btn-ghost small" onClick={() => openCreateEditor({ ...currentDraft, body: '' })}>
            New
          </button>
          <button className="btn-ghost small" onClick={onExportPrompts} disabled={prompts.length === 0}>
            Export
          </button>
          <button className="btn-ghost small" onClick={() => importRef.current?.click()}>
            Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            onChange={importPrompts}
          />
        </div>
      </div>

      {libraryMessage && <p className="library-message">{libraryMessage}</p>}

      <div className="prompt-list">
        {filteredPrompts.length === 0 ? (
          <div className="library-empty">
            <strong>{prompts.length === 0 ? 'No saved prompts yet.' : 'No prompts match that search.'}</strong>
            <span>Save your current prompt or create a reusable template with variables like {'{{client}}'}.</span>
          </div>
        ) : (
          filteredPrompts.map(prompt => {
            const variables = extractTemplateVariables(prompt.body);
            const values = variableValues[prompt.id] ?? {};

            return (
              <article className="saved-prompt-card" key={prompt.id}>
                <div className="saved-prompt-top">
                  <div>
                    <h3>{prompt.title}</h3>
                    <p>
                      {prompt.agent} · {prompt.provider} · {prompt.model}
                    </p>
                  </div>
                  <span className="saved-prompt-date">{formatDate(prompt.lastUsedAt)}</span>
                </div>

                {prompt.tags.length > 0 && (
                  <div className="tag-row">
                    {prompt.tags.map(tag => <span className="tag-chip" key={tag}>{tag}</span>)}
                  </div>
                )}

                {prompt.notes && <p className="saved-prompt-notes">{prompt.notes}</p>}

                <p className="saved-prompt-preview">{prompt.body}</p>

                {variables.length > 0 && (
                  <div className="variable-grid" aria-label={`Variables for ${prompt.title}`}>
                    {variables.map(variable => (
                      <label className="variable-field" key={variable}>
                        <span>{variable}</span>
                        <input
                          value={values[variable] ?? ''}
                          placeholder={`{{${variable}}}`}
                          onChange={event => updateVariable(prompt.id, variable, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                )}

                {prompt.customBoostInstructions && (
                  <p className="custom-rule-preview">Rules: {prompt.customBoostInstructions}</p>
                )}

                <div className="saved-prompt-actions">
                  <button className="btn-ghost small" onClick={() => onLoadPrompt(prompt, values)}>Load</button>
                  <button className="btn-boost small-boost" onClick={() => onBoostPrompt(prompt, values)}>Refine</button>
                  <button className="btn-ghost small" onClick={() => void copyPrompt(prompt)}>
                    {copyStatusId === prompt.id ? 'Copied' : 'Copy'}
                  </button>
                  <button className="btn-ghost small" onClick={() => openEditEditor(prompt)}>Edit</button>
                  <button className="btn-ghost small" onClick={() => onDuplicatePrompt(prompt.id)}>Duplicate</button>
                  <button
                    className={`btn-remove small ${pendingDeleteId === prompt.id ? 'confirming' : ''}`}
                    onClick={() => {
                      if (pendingDeleteId === prompt.id) {
                        onDeletePrompt(prompt.id);
                        setPendingDeleteId(null);
                      } else {
                        setPendingDeleteId(prompt.id);
                      }
                    }}
                    onBlur={() => setPendingDeleteId(null)}
                  >
                    {pendingDeleteId === prompt.id ? 'Confirm?' : 'Delete'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {editor && (
        <div className="modal-backdrop" role="presentation">
          <form className="prompt-modal" onSubmit={submitEditor} role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h2>{editor.mode === 'edit' ? 'Edit saved prompt' : 'Save reusable prompt'}</h2>
                <p>Customize the template, variables, model settings, and boost rules.</p>
              </div>
              <button className="btn-ghost small" type="button" onClick={() => setEditor(null)}>
                Close
              </button>
            </div>

            <label className="form-field">
              <span>Title</span>
              <input
                value={editor.form.title}
                placeholder="Launch brief, SQL reviewer, client email..."
                onChange={event => updateEditorForm({ title: event.target.value })}
              />
            </label>

            <label className="form-field">
              <span>Prompt template</span>
              <textarea
                className="template-editor"
                value={editor.form.body}
                placeholder="Write your reusable prompt. Use {{client}} or {{tone}} for variables."
                onChange={event => updateEditorForm({ body: event.target.value })}
                required
              />
            </label>

            <div className="form-grid">
              <label className="form-field">
                <span>Provider</span>
                <select
                  value={editor.form.provider}
                  onChange={event => handleEditorProviderChange(event.target.value as Provider)}
                >
                  {PROVIDERS.map(provider => (
                    <option key={provider.id} value={provider.id}>{provider.label}</option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Model</span>
                <input
                  value={editor.form.model}
                  list="prompt-template-models"
                  onChange={event => updateEditorForm({ model: event.target.value })}
                  required
                />
                <datalist id="prompt-template-models">
                  {MODELS[editor.form.provider].map(model => (
                    <option key={model.id} value={model.id}>{model.label}</option>
                  ))}
                </datalist>
              </label>

              <label className="form-field">
                <span>Agent</span>
                <select
                  value={editor.form.agent}
                  onChange={event => updateEditorForm({ agent: event.target.value as SavedPromptDraft['agent'] })}
                >
                  {AGENTS.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="form-field">
              <span>Tags</span>
              <input
                value={editor.form.tags}
                placeholder="planning, client, reusable"
                onChange={event => updateEditorForm({ tags: event.target.value })}
              />
            </label>

            <label className="form-field">
              <span>Notes</span>
              <textarea
                className="short-editor"
                value={editor.form.notes}
                placeholder="When should this prompt be used?"
                onChange={event => updateEditorForm({ notes: event.target.value })}
              />
            </label>

            <label className="form-field">
              <span>Custom boost instructions</span>
              <textarea
                className="short-editor"
                value={editor.form.customBoostInstructions}
                placeholder="Optional: how should this template be boosted?"
                onChange={event => updateEditorForm({ customBoostInstructions: event.target.value })}
              />
            </label>

            <div className="modal-actions">
              <button className="btn-ghost" type="button" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn-primary" type="submit" disabled={!editor.form.body.trim() || !editor.form.model.trim()}>
                {editor.mode === 'edit' ? 'Save changes' : 'Save prompt'}
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}
