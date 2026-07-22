import { useEffect, useRef, useState } from "react";
import { friendlyMessage, googleLogin, type AuthUser } from "../api";
import { useAuth } from "../auth";
import "./SignIn.css";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(parent: HTMLElement, options: Record<string, string>): void;
        };
      };
    };
  }
}

type Status =
  | { state: "loading-script" }
  | { state: "ready" }
  | { state: "verifying" }
  | { state: "signed-in"; user: AuthUser }
  | { state: "error"; message: string };

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// A field of exam-sheet bubbles that "grade" themselves on an ambient loop —
// the page's one signature flourish. Frozen to a fixed graded pattern when
// prefers-reduced-motion is set (handled in CSS).
function GradingField() {
  const columns = 12;
  const rows = 6;
  const dots = Array.from({ length: columns * rows }, (_, i) => i);

  return (
    <div className="grading-field" aria-hidden="true">
      {dots.map((i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const delay = (col * 0.18 + row * 0.09) % 4;
        return (
          <span
            key={i}
            className="grading-dot"
            style={{ animationDelay: `${delay}s` }}
          />
        );
      })}
    </div>
  );
}

export default function SignIn() {
  const { signIn } = useAuth();
  const [status, setStatus] = useState<Status>({ state: "loading-script" });
  const buttonSlotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID) {
      setStatus({
        state: "error",
        message: "Google sign-in isn't configured for this environment yet.",
      });
      return;
    }

    let cancelled = false;

    async function handleCredential(response: { credential: string }) {
      setStatus({ state: "verifying" });
      try {
        const result = await googleLogin(response.credential);
        if (!cancelled) {
          setStatus({ state: "signed-in", user: result.user });
          // Persists tokens and flips the app to the signed-in shell.
          signIn(result);
        }
      } catch (err) {
        // The real cause (misconfigured client ID, rejected account, 5xx) goes
        // to the console via friendlyMessage; the user sees calm copy only.
        if (!cancelled) {
          setStatus({
            state: "error",
            message: friendlyMessage(
              err,
              "We couldn't sign you in just now. Give it another try in a moment.",
            ),
          });
        }
      }
    }

    function mountButton() {
      if (!window.google || !buttonSlotRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID!,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(buttonSlotRef.current, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: "280",
      });
      if (!cancelled) setStatus({ state: "ready" });
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_SCRIPT_SRC}"]`,
    );
    if (existing && window.google) {
      mountButton();
      return () => {
        cancelled = true;
      };
    }

    const script = existing ?? document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", mountButton);
    script.addEventListener("error", () =>
      setStatus({
        state: "error",
        message: "Couldn't reach Google. Check your connection and reload.",
      }),
    );
    if (!existing) document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener("load", mountButton);
    };
  }, []);

  return (
    <div className="signin">
      <section className="signin-hero">
        <div className="signin-hero-content">
          <span className="signin-eyebrow">Art Caffe Examinations</span>
          <h1 className="signin-headline">
            Your exams,
            <br />
            in one place.
          </h1>
          <p className="signin-subhead">
            Employees take assigned exams. Examiners author, grade, and release
            results.
          </p>
        </div>
        <GradingField />
      </section>

      <section className="signin-panel">
        <div className="signin-card">
          <div className="signin-card-stub">
            <span className="signin-card-tag">Staff Access</span>
          </div>
          <div className="signin-card-body">
            <h2 className="signin-card-title">Sign in</h2>

            {status.state === "signed-in" ? (
              <div className="signin-success" role="status">
                <p className="signin-success-name">
                  {status.user.first_name || status.user.email}
                </p>
                <p className="signin-success-role">
                  Signed in as {status.user.role}
                </p>
              </div>
            ) : (
              <>
                <div
                  ref={buttonSlotRef}
                  className="signin-google-slot"
                  data-empty={status.state !== "ready" && status.state !== "verifying"}
                />
                {status.state === "loading-script" && (
                  <p className="signin-hint">Loading…</p>
                )}
                {status.state === "verifying" && (
                  <p className="signin-hint signin-hint-mono">Verifying…</p>
                )}
                {status.state === "error" && (
                  <p className="signin-error" role="alert">
                    {status.message}
                  </p>
                )}
              </>
            )}

            <p className="signin-footnote">
              Access is limited to Art Caffe staff Google accounts.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
