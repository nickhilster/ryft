import { useEffect, useState } from 'react';
import type { UserSkill } from '../lib/contextAssembler';
import { createUserSkill, updateUserSkill } from '../lib/userSkills';

interface SkillManagerProps {
  skills: UserSkill[];
  onSave: (skills: UserSkill[]) => void;
}

interface SkillFormState {
  name: string;
  domain: string;
  signals: string;
  lens: string;
}

type EditorState =
  | { mode: 'create'; form: SkillFormState }
  | { mode: 'edit'; skillId: string; form: SkillFormState };

const EMPTY_STATE: SkillFormState = {
  name: '',
  domain: '',
  signals: '',
  lens: '',
};

function toFormState(skill: UserSkill): SkillFormState {
  return {
    name: skill.name,
    domain: skill.domain,
    signals: skill.signals.join(', '),
    lens: skill.lens,
  };
}

function toDraft(form: SkillFormState): Omit<UserSkill, 'id' | 'createdAt'> {
  return {
    name: form.name.trim(),
    domain: form.domain.trim(),
    signals: form.signals
      .split(',')
      .map(signal => signal.trim())
      .filter(Boolean),
    lens: form.lens.trim(),
  };
}

function getLensPreview(lens: string): string {
  const preview = lens.trim().replace(/\s+/g, ' ');
  if (preview.length <= 80) {
    return preview;
  }

  return `${preview.slice(0, 77)}...`;
}

export function SkillManager({ skills, onSave }: SkillManagerProps) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Auto-cancel the delete confirmation after 3 seconds of no action
  useEffect(() => {
    if (!confirmingDeleteId) return;
    const id = window.setTimeout(() => setConfirmingDeleteId(null), 3000);
    return () => window.clearTimeout(id);
  }, [confirmingDeleteId]);

  function openCreateEditor() {
    setEditor({ mode: 'create', form: EMPTY_STATE });
  }

  function openEditEditor(skill: UserSkill) {
    setEditor({ mode: 'edit', skillId: skill.id, form: toFormState(skill) });
  }

  function updateEditorForm(patch: Partial<SkillFormState>) {
    setEditor(prev => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));
  }

  function handleDeleteClick(skillId: string) {
    if (confirmingDeleteId !== skillId) {
      setConfirmingDeleteId(skillId);
      return;
    }

    setConfirmingDeleteId(null);
    onSave(skills.filter(skill => skill.id !== skillId));
    setEditor(prev => {
      if (prev?.mode === 'edit' && prev.skillId === skillId) return null;
      return prev;
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) {
      return;
    }

    const draft = toDraft(editor.form);
    if (!draft.name || !draft.lens) {
      return;
    }

    if (editor.mode === 'edit') {
      onSave(
        skills.map(skill =>
          skill.id === editor.skillId ? updateUserSkill(skill, draft) : skill
        )
      );
    } else {
      onSave([...skills, createUserSkill(draft)]);
    }

    setEditor(null);
  }

  return (
    <section className="skill-manager" aria-label="Custom skills manager">
      <div className="library-header">
        <div>
          <h2>Custom skills</h2>
          <p>{skills.length} reusable layer{skills.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn-primary" type="button" onClick={openCreateEditor}>
          New skill
        </button>
      </div>

      {skills.map(skill => (
        <article className="skill-card" key={skill.id}>
          <div className="skill-card-header">
            <div>
              <div className="skill-card-name">{skill.name}</div>
            </div>
            <div className="pane-header-actions">
              {skill.domain && <span className="skill-domain-tag">{skill.domain}</span>}
              <button className="btn-ghost small" type="button" onClick={() => openEditEditor(skill)}>
                Edit
              </button>
              <button
                className={`btn-remove small ${confirmingDeleteId === skill.id ? 'confirming' : ''}`}
                type="button"
                onClick={() => handleDeleteClick(skill.id)}
              >
                {confirmingDeleteId === skill.id ? 'Confirm?' : 'Delete'}
              </button>
            </div>
          </div>
          <p className="skill-lens-preview">{getLensPreview(skill.lens)}</p>
        </article>
      ))}

      {editor ? (
        <form className="skill-editor" onSubmit={handleSubmit}>
          <div className="skill-editor-field">
            <label className="skill-editor-label" htmlFor="skill-name">
              Name
            </label>
            <input
              id="skill-name"
              className="skill-editor-input"
              type="text"
              value={editor.form.name}
              onChange={event => updateEditorForm({ name: event.target.value })}
              required
            />
          </div>

          <div className="skill-editor-field">
            <label className="skill-editor-label" htmlFor="skill-domain">
              Domain
            </label>
            <input
              id="skill-domain"
              className="skill-editor-input"
              type="text"
              placeholder="e.g. brand, legal, tone"
              value={editor.form.domain}
              onChange={event => updateEditorForm({ domain: event.target.value })}
            />
          </div>

          <div className="skill-editor-field">
            <label className="skill-editor-label" htmlFor="skill-signals">
              Signals
            </label>
            <input
              id="skill-signals"
              className="skill-editor-input"
              type="text"
              placeholder="e.g. email, proposal, legal"
              value={editor.form.signals}
              onChange={event => updateEditorForm({ signals: event.target.value })}
            />
          </div>

          <div className="skill-editor-field">
            <label className="skill-editor-label" htmlFor="skill-lens">
              Lens
            </label>
            <textarea
              id="skill-lens"
              className="skill-editor-textarea"
              placeholder="Describe what this skill should add or look for. Write as bullet points or plain instructions."
              value={editor.form.lens}
              onChange={event => updateEditorForm({ lens: event.target.value })}
            />
          </div>

          <div className="skill-editor-actions">
            <button className="btn-ghost" type="button" onClick={() => setEditor(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              type="submit"
              disabled={!editor.form.name.trim() || !editor.form.lens.trim()}
            >
              Save skill
            </button>
          </div>
        </form>
      ) : null}

      {skills.length === 0 && !editor ? (
        <div className="skill-empty">
          Skills layer your own expertise on top of the built-in agents. Add a brand voice, legal constraints, or any domain knowledge you want applied to every refinement.
        </div>
      ) : null}
    </section>
  );
}