import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  addAssignment,
  createExamType,
  deleteExamType,
  friendlyMessage,
  listAssignments,
  listExamTypes,
  removeAssignment,
  suggestEmails,
  updateExamType,
  type ExamAssignment,
  type ExamType,
} from "../api";
import "./ExamDesk.css";

type Status =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready" };

export default function ExamDesk() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [exams, setExams] = useState<ExamType[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setStatus({ state: "loading" });
    try {
      const result = await listExamTypes();
      setExams(result);
      setSelectedId((current) =>
        current !== null && result.some((exam) => exam.id === current)
          ? current
          : (result[0]?.id ?? null),
      );
      setStatus({ state: "ready" });
    } catch (err) {
      setStatus({
        state: "error",
        message: friendlyMessage(
          err,
          "We couldn't load your exams right now. Check your connection and try again.",
        ),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = exams.find((exam) => exam.id === selectedId) ?? null;

  function patchLocal(updated: ExamType) {
    setExams((current) => current.map((exam) => (exam.id === updated.id ? updated : exam)));
  }

  function dropLocal(deletedId: number) {
    const remaining = exams.filter((exam) => exam.id !== deletedId);
    setExams(remaining);
    setSelectedId((selected) =>
      selected === deletedId ? (remaining[0]?.id ?? null) : selected,
    );
  }

  return (
    <section className="desk">
      <header className="desk-head">
        <span className="desk-eyebrow">Exam desk</span>
        <h1 className="desk-title">Exams you run</h1>
        <p className="desk-lede">
          Create an exam, then add each examinee's email so it appears on their board.
        </p>
      </header>

      {status.state === "loading" && <p className="desk-hint">Loading exams…</p>}

      {status.state === "error" && (
        <div className="desk-error" role="alert">
          <p>{status.message}</p>
          <button type="button" className="btn-quiet" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {status.state === "ready" && (
        <div className="desk-panes">
          <aside className="desk-list">
            <NewExamForm
              onCreated={(exam) => {
                setExams((current) => [...current, exam].sort((a, b) => a.name.localeCompare(b.name)));
                setSelectedId(exam.id);
              }}
            />

            {exams.length === 0 ? (
              <p className="desk-list-empty">No exams yet. Create the first one above.</p>
            ) : (
              <ul className="desk-exam-list">
                {exams.map((exam) => (
                  <li key={exam.id}>
                    <button
                      type="button"
                      className="desk-exam-row"
                      aria-current={exam.id === selectedId ? "true" : undefined}
                      onClick={() => setSelectedId(exam.id)}
                    >
                      <span className="desk-exam-name">{exam.name}</span>
                      {!exam.is_active && <span className="desk-exam-retired">retired</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {selected ? (
            <ExamDetail
              key={selected.id}
              exam={selected}
              onUpdated={patchLocal}
              onDeleted={dropLocal}
            />
          ) : (
            <div className="desk-detail desk-detail-empty">
              <p>Select an exam to manage its details and examinees.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function NewExamForm({ onCreated }: { onCreated: (exam: ExamType) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const exam = await createExamType({ name: trimmed, description: "" });
      setName("");
      onCreated(exam);
    } catch (err) {
      setError(friendlyMessage(err, "We couldn't create that exam. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="desk-new" onSubmit={submit}>
      <label className="desk-label" htmlFor="new-exam-name">
        New exam
      </label>
      <div className="desk-new-row">
        <input
          id="new-exam-name"
          className="desk-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Barista Exam"
          disabled={saving}
        />
        <button type="submit" className="btn-primary btn-compact" disabled={saving || !name.trim()}>
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
      {error && (
        <p className="desk-field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function ExamDetail({
  exam,
  onUpdated,
  onDeleted,
}: {
  exam: ExamType;
  onUpdated: (exam: ExamType) => void;
  onDeleted: (examId: number) => void;
}) {
  const [description, setDescription] = useState(exam.description);
  const [savingDesc, setSavingDesc] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<ExamAssignment[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const loadRoster = useCallback(async () => {
    setRosterError(null);
    try {
      setAssignments(await listAssignments(exam.id));
    } catch (err) {
      setRosterError(
        friendlyMessage(err, "We couldn't load the examinees. Reselect the exam to retry."),
      );
    }
  }, [exam.id]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  async function saveDescription() {
    if (description === exam.description) return;
    setSavingDesc(true);
    setDetailError(null);
    try {
      onUpdated(await updateExamType(exam.id, { description }));
    } catch (err) {
      setDetailError(
        friendlyMessage(err, "We couldn't save the description. Your text is still here — retry."),
      );
    } finally {
      setSavingDesc(false);
    }
  }

  async function deleteExam() {
    const confirmed = window.confirm(
      `Delete "${exam.name}"? This removes the exam and its examinee list for good — ` +
        "if you just want to hide it from employees, retire it instead.",
    );
    if (!confirmed) return;
    setDeleting(true);
    setDetailError(null);
    try {
      await deleteExamType(exam.id);
      onDeleted(exam.id);
    } catch (err) {
      setDetailError(friendlyMessage(err, "We couldn't delete the exam. Please try again."));
      setDeleting(false);
    }
  }

  async function toggleActive() {
    setDetailError(null);
    try {
      onUpdated(await updateExamType(exam.id, { is_active: !exam.is_active }));
    } catch (err) {
      setDetailError(friendlyMessage(err, "We couldn't update the exam. Please try again."));
    }
  }

  // Debounced lookup of employee emails matching what's been typed, minus
  // anyone already on the roster. Failures just leave the dropdown closed —
  // typing the full email still works.
  useEffect(() => {
    const query = newEmail.trim();
    if (!query) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const found = await suggestEmails(query);
        if (cancelled) return;
        const taken = new Set((assignments ?? []).map((a) => a.email.toLowerCase()));
        const usable = found.filter(
          (email) => !taken.has(email.toLowerCase()) && email.toLowerCase() !== query.toLowerCase(),
        );
        setSuggestions(usable);
        setSuggestionsOpen(usable.length > 0);
        setActiveSuggestion(-1);
      } catch {
        if (!cancelled) setSuggestionsOpen(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [newEmail, assignments]);

  function pickSuggestion(email: string) {
    setNewEmail(email);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
  }

  function onEmailKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestionsOpen || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      pickSuggestion(suggestions[activeSuggestion]);
    } else if (event.key === "Escape") {
      setSuggestionsOpen(false);
    }
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    setSuggestionsOpen(false);
    setAddingEmail(true);
    setRosterError(null);
    try {
      const created = await addAssignment(exam.id, email);
      setAssignments((current) =>
        current ? [...current, created].sort((a, b) => a.email.localeCompare(b.email)) : [created],
      );
      setNewEmail("");
    } catch (err) {
      setRosterError(friendlyMessage(err, "We couldn't add that email. Please try again."));
    } finally {
      setAddingEmail(false);
    }
  }

  async function removeEmail(assignment: ExamAssignment) {
    setRosterError(null);
    try {
      await removeAssignment(exam.id, assignment.id);
      setAssignments((current) =>
        current ? current.filter((item) => item.id !== assignment.id) : current,
      );
    } catch (err) {
      setRosterError(friendlyMessage(err, "We couldn't remove that email. Please try again."));
    }
  }

  return (
    <div className="desk-detail">
      <div className="desk-detail-head">
        <h2 className="desk-detail-name">{exam.name}</h2>
        <div className="desk-detail-actions">
          <button
            type="button"
            className="btn-quiet"
            onClick={() => void toggleActive()}
            disabled={deleting}
          >
            {exam.is_active ? "Retire exam" : "Reactivate"}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => void deleteExam()}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete exam"}
          </button>
        </div>
      </div>
      {!exam.is_active && (
        <p className="desk-retired-note">
          Retired — employees can't see or start this exam until it's reactivated.
        </p>
      )}

      <label className="desk-label" htmlFor="exam-description">
        Description
      </label>
      <textarea
        id="exam-description"
        className="desk-input desk-textarea"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        onBlur={() => void saveDescription()}
        placeholder="What this exam covers — employees see this next to the exam name."
        rows={3}
      />
      {savingDesc && <p className="desk-hint">Saving…</p>}
      {detailError && (
        <p className="desk-field-error" role="alert">
          {detailError}
        </p>
      )}

      <h3 className="desk-roster-title">Examinees</h3>
      <form className="desk-new-row" onSubmit={submitEmail}>
        <div className="desk-autocomplete">
          <input
            className="desk-input"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            onKeyDown={onEmailKeyDown}
            onFocus={() => setSuggestionsOpen(suggestions.length > 0)}
            onBlur={() => setSuggestionsOpen(false)}
            placeholder="employee@artcaffe.co.ke"
            aria-label="Examinee email"
            role="combobox"
            aria-expanded={suggestionsOpen}
            aria-autocomplete="list"
            aria-controls="examinee-email-suggestions"
            aria-activedescendant={
              activeSuggestion >= 0 ? `examinee-email-suggestion-${activeSuggestion}` : undefined
            }
            autoComplete="off"
            disabled={addingEmail}
          />
          {suggestionsOpen && (
            <ul
              id="examinee-email-suggestions"
              className="desk-suggestions"
              role="listbox"
              aria-label="Matching employee emails"
              // Keep focus in the input so onBlur doesn't close the list
              // before the click below lands.
              onMouseDown={(event) => event.preventDefault()}
            >
              {suggestions.map((email, index) => (
                <li
                  key={email}
                  id={`examinee-email-suggestion-${index}`}
                  role="option"
                  aria-selected={index === activeSuggestion}
                  className={
                    index === activeSuggestion ? "desk-suggestion is-active" : "desk-suggestion"
                  }
                  onClick={() => pickSuggestion(email)}
                  onMouseEnter={() => setActiveSuggestion(index)}
                >
                  {email}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          className="btn-primary btn-compact"
          disabled={addingEmail || !newEmail.trim()}
        >
          {addingEmail ? "Adding…" : "Add"}
        </button>
      </form>
      {rosterError && (
        <p className="desk-field-error" role="alert">
          {rosterError}
        </p>
      )}

      {assignments === null ? (
        <p className="desk-hint">Loading examinees…</p>
      ) : assignments.length === 0 ? (
        <p className="desk-list-empty">
          No examinees yet. Add an email above — the exam appears on their board the
          moment they sign in with it.
        </p>
      ) : (
        <ul className="desk-roster">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="desk-roster-row">
              <span className="desk-roster-email">{assignment.email}</span>
              <button
                type="button"
                className="desk-roster-remove"
                onClick={() => void removeEmail(assignment)}
                aria-label={`Remove ${assignment.email}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
