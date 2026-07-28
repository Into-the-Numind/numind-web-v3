// Unit tests for src/stores/skill.ts focused on skill-3tier-visibility T4 FE behavior.
// Mocks @/api/skill so we verify store action → state without hitting axios.
// Pattern mirrors src/stores/__tests__/marketplace.spec.ts.

import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useSkillStore } from '../skill'
import type { Skill, SkillListResponse, CreateSkillRequest } from '@/types/skill'

// A minimal-but-complete Skill row carrying the new T4 fields.
function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    id: 1,
    parent_user_id: 1,
    owner_user_id: 1,
    name: '销售数据分析',
    description: '',
    when_to_use: '',
    allowed_tools: [],
    body_md: '# body',
    source_type: 'custom',
    source_template_id: null,
    visibility: 'institution',
    origin_type: 'tenant',
    version: 1,
    is_active: true,
    created_by: 1,
    created_at: '2026-06-17T00:00:00Z',
    updated_at: '2026-06-17T00:00:00Z',
    can_edit: true,
    ...over
  }
}

// Three-tier list fixture: official (read-only), institution (editable), sub_user (editable),
// plus a marketplace-reference pointer row.
const listFixture: SkillListResponse = {
  list: [
    makeSkill({ id: 10, visibility: 'official', owner_user_id: 0, can_edit: false }),
    makeSkill({ id: 11, visibility: 'institution', can_edit: true }),
    makeSkill({ id: 12, visibility: 'sub_user', owner_user_id: 1, can_edit: true }),
    makeSkill({
      id: 13,
      visibility: 'institution',
      can_edit: true,
      marketplace_id: 77,
      subscription_id: 88
    })
  ],
  total: 4
}

// Capture the payload createSkill was called with so we can assert visibility passes through.
const createSpy = vi.fn(
  async (payload: CreateSkillRequest): Promise<Skill> =>
    makeSkill({
      id: 99,
      name: payload.name,
      visibility: payload.visibility === 'sub_user' ? 'sub_user' : 'institution'
    })
)

vi.mock('@/api/skill', () => ({
  createSkill: (p: CreateSkillRequest) => createSpy(p),
  listSkills: vi.fn(async (): Promise<SkillListResponse> => listFixture),
  getSkill: vi.fn(async (): Promise<Skill> => makeSkill()),
  updateSkill: vi.fn(async (_id: number, p: CreateSkillRequest): Promise<Skill> => makeSkill(p)),
  deleteSkill: vi.fn(async () => ({ affected_bindings: 0 })),
  attachSkillToAgent: vi.fn(async () => ({})),
  detachSkillFromAgent: vi.fn(async () => undefined),
  reorderAgentSkills: vi.fn(async () => undefined),
  listAgentSkills: vi.fn(async () => ({ list: [] })),
  importSkillTemplate: vi.fn(async (): Promise<Skill> => makeSkill())
}))

describe('useSkillStore — skill-3tier-visibility T4', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    createSpy.mockClear()
  })

  it('fetchList preserves the 3-tier visibility field on each row', async () => {
    const store = useSkillStore()
    await store.fetchList()
    expect(store.list).toHaveLength(4)
    const byId = (id: number) => store.list.find((s) => s.id === id)!
    expect(byId(10).visibility).toBe('official')
    expect(byId(11).visibility).toBe('institution')
    expect(byId(12).visibility).toBe('sub_user')
  })

  it('fetchList preserves can_edit gating (official read-only, own editable)', async () => {
    const store = useSkillStore()
    await store.fetchList()
    const byId = (id: number) => store.list.find((s) => s.id === id)!
    expect(byId(10).can_edit).toBe(false) // official → read-only
    expect(byId(11).can_edit).toBe(true)
    expect(byId(12).can_edit).toBe(true)
  })

  it('fetchList preserves marketplace reference pointer fields', async () => {
    const store = useSkillStore()
    await store.fetchList()
    const ref = store.list.find((s) => s.id === 13)!
    expect(ref.marketplace_id).toBe(77)
    expect(ref.subscription_id).toBe(88)
  })

  it('create passes visibility through to the API payload (institution)', async () => {
    const store = useSkillStore()
    await store.create({ name: '机构技能', body_md: '# x', visibility: 'institution' })
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0][0].visibility).toBe('institution')
  })

  it('create passes visibility through to the API payload (sub_user)', async () => {
    const store = useSkillStore()
    const created = await store.create({ name: '个人技能', body_md: '# x', visibility: 'sub_user' })
    expect(createSpy.mock.calls[0][0].visibility).toBe('sub_user')
    expect(created.visibility).toBe('sub_user')
  })
})
