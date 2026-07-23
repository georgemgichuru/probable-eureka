// Minimal API client. All requests go through the same origin under /api,
// which nginx (prod) or the Vite dev proxy routes to the Django backend.
//
// Auth: JWTs are persisted to localStorage. `request()` attaches the access
// token and, on a 401, transparently retries once after refreshing it. When
// the refresh token is also dead, the registered expiry handler signs out.

const API_BASE = "/api";
const AUTH_STORAGE_KEY = "artcaffe.auth";

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

// ---------- Auth types & storage ----------

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

export type StoredAuth = GoogleLoginResponse;

export function loadStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    return parsed.access && parsed.refresh && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStoredAuth(auth: StoredAuth): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

/** Called when both the access and refresh tokens are rejected. */
let onAuthExpired: (() => void) | null = null;

export function setAuthExpiredHandler(handler: (() => void) | null): void {
  onAuthExpired = handler;
}

// ---------- Errors ----------

export class ApiError extends Error {
  /** HTTP status, or 0 if the request never reached the server. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Kept as a distinct name because SignIn surfaces it specially. */
export class GoogleLoginError extends ApiError {}

/**
 * The only server text ever shown to users is our own curated validation copy
 * (HTTP 400 — e.g. "This email is already assigned to this exam"). Everything
 * else — network failures, 5xx, crashes — logs to the console for developers
 * and resolves to the caller's friendly fallback copy.
 */
export function friendlyMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 400) return err.message;
  console.error(err);
  return fallback;
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

async function errorFromResponse(res: Response, fallback: string): Promise<ApiError> {
  let detail: string | null = null;
  try {
    detail = flattenDrfError(await res.json());
  } catch {
    // Non-JSON body (e.g. an nginx or proxy error page) — fall back to the status.
  }
  return new ApiError(detail ?? `${fallback} (HTTP ${res.status}).`, res.status);
}

// ---------- Core request helper ----------

async function refreshAccessToken(): Promise<string | null> {
  const stored = loadStoredAuth();
  if (!stored) return null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: stored.refresh }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const body = (await res.json()) as { access: string; refresh?: string };
  saveStoredAuth({
    ...stored,
    access: body.access,
    // SIMPLE_JWT rotates refresh tokens; keep the new one when present.
    refresh: body.refresh ?? stored.refresh,
  });
  return body.access;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const doFetch = (access: string | null) =>
    fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res: Response;
  try {
    res = await doFetch(loadStoredAuth()?.access ?? null);
    if (res.status === 401) {
      const access = await refreshAccessToken();
      if (!access) {
        clearStoredAuth();
        onAuthExpired?.();
        throw new ApiError("Your session has expired. Please sign in again.", 401);
      }
      res = await doFetch(access);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Couldn't reach the server. Check your connection.", 0);
  }

  if (!res.ok) throw await errorFromResponse(res, "Request failed");
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- Auth endpoints ----------

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
    const err = await errorFromResponse(res, "Sign-in failed");
    throw new GoogleLoginError(err.message, err.status);
  }

  return (await res.json()) as GoogleLoginResponse;
}

/**
 * Best-effort server-side sign-out: blacklists the refresh token so the
 * session can't be revived. Tokens are captured up front so this keeps
 * working after the caller clears local storage; failures are only logged
 * because the caller drops the local session regardless.
 */
export async function logout(): Promise<void> {
  const stored = loadStoredAuth();
  if (!stored) return;

  const send = (access: string, refresh: string) =>
    fetch(`${API_BASE}/auth/logout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
      body: JSON.stringify({ refresh }),
    });

  try {
    const res = await send(stored.access, stored.refresh);
    if (res.status !== 401) return;

    // Access token expired: mint a fresh pair with the refresh token, then
    // revoke that pair (rotation already blacklisted the original refresh).
    const refreshRes = await fetch(`${API_BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: stored.refresh }),
    });
    if (!refreshRes.ok) return; // Refresh token already dead — nothing to revoke.
    const body = (await refreshRes.json()) as { access: string; refresh?: string };
    await send(body.access, body.refresh ?? stored.refresh);
  } catch (err) {
    console.error("Logout request failed; local session cleared anyway.", err);
  }
}

// ---------- Exam types ----------

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ExamType {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
}

export interface ExamAssignment {
  id: number;
  email: string;
  created_at: string;
}

export interface AssignedExam {
  id: number;
  name: string;
  description: string;
}

export interface ExamSession {
  id: number;
  exam_type: AssignedExam;
  status: "in_progress" | "completed";
  started_at: string;
}

// HR (admin / examiner)

export async function listExamTypes(): Promise<ExamType[]> {
  return (await request<Paginated<ExamType>>("/exams/types/")).results;
}

export function createExamType(data: { name: string; description: string }): Promise<ExamType> {
  return request("/exams/types/", { method: "POST", body: data });
}

export function updateExamType(
  id: number,
  data: Partial<Pick<ExamType, "name" | "description" | "is_active">>,
): Promise<ExamType> {
  return request(`/exams/types/${id}/`, { method: "PATCH", body: data });
}

export function deleteExamType(id: number): Promise<void> {
  return request(`/exams/types/${id}/`, { method: "DELETE" });
}

export async function listAssignments(examTypeId: number): Promise<ExamAssignment[]> {
  return (await request<Paginated<ExamAssignment>>(`/exams/types/${examTypeId}/assignments/`))
    .results;
}

export function addAssignment(examTypeId: number, email: string): Promise<ExamAssignment> {
  return request(`/exams/types/${examTypeId}/assignments/`, {
    method: "POST",
    body: { email },
  });
}

/** Employee emails matching `query`, for the examinee autocomplete. */
export function suggestEmails(query: string): Promise<string[]> {
  return request(`/users/emails/?q=${encodeURIComponent(query)}`);
}

export function removeAssignment(examTypeId: number, assignmentId: number): Promise<void> {
  return request(`/exams/types/${examTypeId}/assignments/${assignmentId}/`, {
    method: "DELETE",
  });
}

// Employee

export async function listMyExams(): Promise<AssignedExam[]> {
  return (await request<Paginated<AssignedExam>>("/exams/my/")).results;
}

export function startExam(examTypeId: number): Promise<ExamSession> {
  return request(`/exams/my/${examTypeId}/start/`, { method: "POST" });
}
