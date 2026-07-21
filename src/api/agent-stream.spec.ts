import { describe, expect, it } from 'vitest'

import { compareAgentStreamCursor, parseAgentSseChunk } from './agent-stream'

describe('Agent SSE transport cursor', () => {
  it('parses the SSE id separately from the JSON event protocol', () => {
    const event = parseAgentSseChunk<Record<string, unknown>>(
      'id: 18446744073709551615-9\ndata: {"type":"token_delta","seq":1,"run_id":7}\n\n'
    )
    expect(event).toMatchObject({
      type: 'token_delta',
      seq: 1,
      run_id: 7,
      transport_cursor: '18446744073709551615-9'
    })
  })

  it('orders 64-bit Redis IDs without Number precision loss', () => {
    expect(compareAgentStreamCursor('9999999999999999999-9', '10000000000000000000-0')).toBe(-1)
    expect(compareAgentStreamCursor('10000000000000000000-10', '10000000000000000000-2')).toBe(1)
    expect(compareAgentStreamCursor('42-7', '42-7')).toBe(0)
  })
})
