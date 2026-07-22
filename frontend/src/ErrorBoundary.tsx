// Last line of defense: any unhandled render error shows a calm recovery page
// instead of React's blank screen. Details go to the console, never the user.

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("Unhandled UI error:", error, info);
  }

  render() {
    if (!this.state.crashed) return this.props.children;

    return (
      <div className="fallback">
        <div className="fallback-card" role="alert">
          <span className="fallback-tag">Art Caffe Examinations</span>
          <h1 className="fallback-title">Something went off the boil.</h1>
          <p className="fallback-note">
            This page hit a snag on our side — nothing you did. Reloading usually
            puts it right, and your sign-in is kept.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
