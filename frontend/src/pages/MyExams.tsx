import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  friendlyMessage,
  listMyExams,
  startExam,
  type AssignedExam,
  type ExamSession,
} from "../api";
import "./MyExams.css";

type Status =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; exams: AssignedExam[] };

export default function MyExams() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [pending, setPending] = useState<AssignedExam | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [session, setSession] = useState<ExamSession | null>(null);

  const load = useCallback(async () => {
    setStatus({ state: "loading" });
    try {
      const exams = await listMyExams();
      setStatus({ state: "ready", exams });
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

  async function confirmStart() {
    if (!pending) return;
    setStarting(true);
    setStartError(null);
    try {
      const result = await startExam(pending.id);
      setSession(result);
      setPending(null);
    } catch (err) {
      // A 404 means the assignment was pulled between listing and starting —
      // close the ticket and refresh the board instead of stranding the user.
      if (err instanceof ApiError && err.status === 404) {
        setPending(null);
        void load();
      } else {
        setStartError(
          friendlyMessage(err, "We couldn't check you in just now. Please try again."),
        );
      }
    } finally {
      setStarting(false);
    }
  }

  if (session) {
    return (
      <section className="myexams">
        <div className="session-ticket" role="status">
          <span className="session-ticket-tag">Exam in progress</span>
          <h1 className="session-ticket-name">{session.exam_type.name}</h1>
          <p className="session-ticket-meta">
            Started {new Date(session.started_at).toLocaleString()}
          </p>
          <p className="session-ticket-note">
            You're checked in. Your examiner will release the questions here — keep
            this page open.
          </p>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              setSession(null);
              void load();
            }}
          >
            Back to my exams
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="myexams">
      <header className="myexams-head">
        <span className="myexams-eyebrow">Assigned to you</span>
        <h1 className="myexams-title">My exams</h1>
        <p className="myexams-lede">
          Pick the exam you were asked to take, then confirm it to begin.
        </p>
      </header>

      {status.state === "loading" && <p className="myexams-hint">Loading your exams…</p>}

      {status.state === "error" && (
        <div className="myexams-error" role="alert">
          <p>{status.message}</p>
          <button type="button" className="btn-quiet" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {status.state === "ready" && status.exams.length === 0 && (
        <div className="myexams-empty">
          <p className="myexams-empty-title">Nothing on your board yet.</p>
          <p className="myexams-empty-note">
            When HR assigns you an exam, it appears here under this email address.
          </p>
        </div>
      )}

      {status.state === "ready" && status.exams.length > 0 && (
        <ul className="menu-board">
          {status.exams.map((exam) => (
            <li key={exam.id} className="menu-item">
              <div className="menu-item-text">
                <span className="menu-item-name">{exam.name}</span>
                {exam.description && (
                  <span className="menu-item-desc">{exam.description}</span>
                )}
              </div>
              <span className="menu-leader" aria-hidden="true" />
              <button
                type="button"
                className="menu-item-action"
                onClick={() => {
                  setStartError(null);
                  setPending(exam);
                }}
              >
                Take this exam
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <ConfirmTicket
          exam={pending}
          starting={starting}
          error={startError}
          onConfirm={() => void confirmStart()}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}

function ConfirmTicket({
  exam,
  starting,
  error,
  onConfirm,
  onCancel,
}: {
  exam: AssignedExam;
  starting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="ticket-overlay" role="presentation" onClick={onCancel}>
      <div
        className="ticket"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ticket-title"
        aria-describedby="ticket-warning"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ticket-stub">
          <span className="ticket-stub-tag">Confirm your exam</span>
        </div>
        <div className="ticket-body">
          <h2 id="ticket-title" className="ticket-exam-name">
            {exam.name}
          </h2>
          <p id="ticket-warning" className="ticket-warning">
            Make sure this is the exam you were asked to take. Once you begin,
            your attempt is recorded against this exam.
          </p>
          {error && (
            <p className="ticket-error" role="alert">
              {error}
            </p>
          )}
          <div className="ticket-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={starting}
              onClick={onConfirm}
            >
              {starting ? "Checking in…" : `Begin ${exam.name}`}
            </button>
            <button
              type="button"
              ref={cancelRef}
              className="btn-quiet"
              disabled={starting}
              onClick={onCancel}
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
