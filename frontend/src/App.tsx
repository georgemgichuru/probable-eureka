import { useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import ErrorBoundary from "./ErrorBoundary";
import SignIn from "./pages/SignIn";
import MyExams from "./pages/MyExams";
import ExamDesk from "./pages/ExamDesk";
import "./App.css";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function Root() {
  const { user } = useAuth();
  // There's no client-side router: the app lives at "/". Any other path (an
  // old bookmark, a mistyped link) gets a gentle landing instead of a page
  // that pretends to be something it isn't.
  const [path, setPath] = useState(window.location.pathname);

  if (path !== "/") {
    return (
      <NotFound
        onHome={() => {
          window.history.replaceState(null, "", "/");
          setPath("/");
        }}
      />
    );
  }

  if (!user) return <SignIn />;
  return <Shell />;
}

function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <div className="fallback">
      <div className="fallback-card">
        <span className="fallback-tag">Art Caffe Examinations</span>
        <h1 className="fallback-title">That page isn't on the menu.</h1>
        <p className="fallback-note">
          The address you followed doesn't exist here. Everything you need is on
          the main board.
        </p>
        <button type="button" className="btn-primary" onClick={onHome}>
          Go to my board
        </button>
      </div>
    </div>
  );
}

type View = "desk" | "mine";

function Shell() {
  const { user, signOut } = useAuth();
  // Admins and examiners run the exam desk; they can still flip to their own
  // assigned exams (HR staff get examined too).
  const isHr = user!.role !== "employee";
  const [view, setView] = useState<View>(isHr ? "desk" : "mine");

  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="shell-brand">
          <span className="shell-wordmark">Art Caffe</span>
          <span className="shell-wordmark-sub">Examinations</span>
        </div>

        {isHr && (
          <nav className="shell-nav" aria-label="Workspace">
            <button
              type="button"
              className="shell-nav-link"
              aria-current={view === "desk" ? "page" : undefined}
              onClick={() => setView("desk")}
            >
              Exam desk
            </button>
            <button
              type="button"
              className="shell-nav-link"
              aria-current={view === "mine" ? "page" : undefined}
              onClick={() => setView("mine")}
            >
              My exams
            </button>
          </nav>
        )}

        <div className="shell-user">
          <span className="shell-user-email">{user!.email}</span>
          <span className="shell-user-role">{user!.role}</span>
          <button type="button" className="shell-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="shell-main">
        {isHr && view === "desk" ? <ExamDesk /> : <MyExams />}
      </main>
    </div>
  );
}
