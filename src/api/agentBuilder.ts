// API wrappers for /v1/agent/skills/* (5 endpoints, user_token middleware).
// Backend: numind-server feature #5 agent-mode-skill-system (merged e05498b6).
// Parent-account only — child accounts receive HTTP 403 from backend biz layer.
//
// Student-facing agent endpoints live in src/api/agent.ts (do NOT confuse — that
// file is the consumer view for running agents, this file is the configurator view).
//
// Implementation note: web-v3 axios `request` instance has a response interceptor
// that unwraps `{code, message, data}` and returns the body. TypeScript still
// sees axios's `AxiosResponse<T>` type, so we cast through `as any` to bridge
// the gap. This matches the established pattern in src/api/sop.ts.

import request from './request'
import type {
  Agent,
  CreateAgentPayload,
  PatchAgentPayload,
  ListResponse
} from '@/types/agentBuilder'

export interface ListAgentsParams {
  page?: number
  page_size?: number
  include_inactive?: boolean
}

// 1. POST /v1/agent/skills — Create
export const createAgent = async (payload: CreateAgentPayload): Promise<Agent> => {
  const res = await request.post('/v1/agent/skills', payload)
  return (res as unknown as { data: Agent }).data
}

// 2. GET /v1/agent/skills — List (parent's own agents)
export const listAgents = async (params: ListAgentsParams = {}): Promise<ListResponse<Agent>> => {
  const res = await request.get('/v1/agent/skills', { params })
  return (res as unknown as { data: ListResponse<Agent> }).data
}

// 3. GET /v1/agent/skills/:id — Get one
export const getAgent = async (id: number): Promise<Agent> => {
  const res = await request.get(`/v1/agent/skills/${id}`)
  return (res as unknown as { data: Agent }).data
}

// 4. PATCH /v1/agent/skills/:id — Partial update
export const patchAgent = async (id: number, payload: PatchAgentPayload): Promise<Agent> => {
  const res = await request.patch(`/v1/agent/skills/${id}`, payload)
  return (res as unknown as { data: Agent }).data
}

// 5. DELETE /v1/agent/skills/:id — Soft delete (is_active=false)
export const deleteAgent = async (id: number): Promise<void> => {
  await request.delete(`/v1/agent/skills/${id}`)
}
