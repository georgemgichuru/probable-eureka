// Minimal API client. All requests go through the same origin under /api,
// which nginx (prod) or the Vite dev proxy routes to the Django backend.

const API_BASE = "/api";

export interface HealthResponse {
  status: string;
  db: string;
  redis: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health/`);
  if (!res.ok && res.status !== 503) {
    throw new Error(`Health request failed: ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}

export interface AuthUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "examiner" | "employee";
}

export interface GoogleLoginResponse {
  access: string;
  refresh: string;
  user: AuthUser;
}

export class GoogleLoginError extends Error {
  /** HTTP status, or 0 if the request never reached the server. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// DRF reports errors as either a bare list of strings (raised ValidationError) or
// an object mapping field names to lists. Flatten both into one readable line.
function flattenDrfError(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (Array.isArray(body)) return body.map(String).join(" ");
  if (body && typeof body === "object") {
    const parts = Object.values(body as Record<string, unknown>).flatMap((v) =>
      Array.isArray(v) ? v.map(String) : [String(v)],
    );
    return parts.length ? parts.join(" ") : null;
  }
  return null;
}

export async function googleLogin(idToken: string): Promise<GoogleLoginResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/google/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });
  } catch {
    throw new GoogleLoginError("Couldn't reach the server. Check your connection.", 0);
  }

  if (!res.ok) {
    let detail: string | null = null;
    try {
      detail = flattenDrfError(await res.json());
    } catch {
      // Non-JSON body (e.g. an nginx or proxy error page) — fall back to the status.
    }
    throw new GoogleLoginError(detail ?? `Sign-in failed (HTTP ${res.status}).`, res.status);
  }

  return (await res.json()) as GoogleLoginResponse;
}
