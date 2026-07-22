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
