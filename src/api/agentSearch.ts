// Task 3.5 agent history Chinese FULLTEXT search API wrapper.
//
// Backend: GET /v1/agent-runs/search — see
// numind-server/internal/numind/controller/v1/agent/agent_search.go.
//
// User isolation is enforced at the SQL WHERE level (server-side); this client
// just forwards the auth token. Snippet contains <mark>...</mark> markup and is
// HTML-safe (server escapes content before inserting <mark>).

import request from './request'

export interface AgentSearchResult {
  message_uuid: string
  agent_run_id: number
  session_id: string
  role: string
  content: string
  /**
   * Snippet contains <mark>...</mark> tags around matching tokens. Safe to
   * render with v-html — the server html-escapes user content before inserting
   * <mark>, so XSS payloads cannot survive.
   */
  snippet: string
  score: number
  created_at: string
}

export interface AgentSearchResponse {
  results: AgentSearchResult[]
  total: number
}

export interface AgentSearchParams {
  q?: string
  session_id?: string
  /** ISO date or RFC3339; e.g. "2026-01-01" */
  from?: string
  /** ISO date or RFC3339; e.g. "2026-05-23" */
  to?: string
  limit?: number
  offset?: number
}

export const searchAgentRuns = async (
  params: AgentSearchParams
): Promise<AgentSearchResponse> => {
  // request interceptor returns the full {code, message, data} body (not raw
  // AxiosResponse). We cast through unknown to extract data.X following the
  // pattern in src/api/sop.ts (the rest of src/api/agent.ts uses the buggy
  // `{ data: X }` generic — fix-forward as those endpoints get touched).
  const res = await request.get('/v1/agent-runs/search', { params })
  return (res as unknown as { data: AgentSearchResponse }).data
}
