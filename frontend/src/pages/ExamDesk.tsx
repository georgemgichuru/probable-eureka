import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  addAssignment,
  createExamType,
  friendlyMessage,
  listAssignments,
  listExamTypes,
  removeAssignment,
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
            <ExamDetail key={selected.id} exam={selected} onUpdated={patchLocal} />
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
}: {
  exam: ExamType;
  onUpdated: (exam: ExamType) => void;
}) {
  const [description, setDescription] = useState(exam.description);
  const [savingDesc, setSavingDesc] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<ExamAssignment[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);

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

  async function toggleActive() {
    setDetailError(null);
    try {
      onUpdated(await updateExamType(exam.id, { is_active: !exam.is_active }));
    } catch (err) {
      setDetailError(friendlyMessage(err, "We couldn't update the exam. Please try again."));
    }
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
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
        <button type="button" className="btn-quiet" onClick={() => void toggleActive()}>
          {exam.is_active ? "Retire exam" : "Reactivate"}
        </button>
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
        <input
          className="desk-input"
          type="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          placeholder="employee@artcaffe.co.ke"
          aria-label="Examinee email"
          disabled={addingEmail}
        />
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
