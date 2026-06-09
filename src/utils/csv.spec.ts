import { describe, it, expect, vi, afterEach } from 'vitest'
import { escapeCsvField, buildCsv, downloadCsv } from './csv'

describe('escapeCsvField', () => {
  it('passes plain strings/numbers through unchanged', () => {
    expect(escapeCsvField('abc')).toBe('abc')
    expect(escapeCsvField(123)).toBe('123')
    expect(escapeCsvField(0)).toBe('0')
    expect(escapeCsvField(false)).toBe('false')
  })

  it('coerces null / undefined to empty string', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('quotes fields containing a comma', () => {
    expect(escapeCsvField('张三,李四')).toBe('"张三,李四"')
  })

  it('quotes and doubles internal double-quotes', () => {
    expect(escapeCsvField('a"b')).toBe('"a""b"')
  })

  it('quotes fields containing newlines (LF and CRLF)', () => {
    expect(escapeCsvField('a\nb')).toBe('"a\nb"')
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"')
  })

  // CSV / Formula Injection (OWASP CWE-1236)
  it('neutralizes formula-injection triggers by prefixing a single quote', () => {
    expect(escapeCsvField('=1+1')).toBe("'=1+1")
    expect(escapeCsvField('+1234567890')).toBe("'+1234567890")
    expect(escapeCsvField('-2+3')).toBe("'-2+3")
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvField('\tabc')).toBe("'\tabc")
  })

  it('neutralizes a HYPERLINK formula even when it also needs quoting', () => {
    // starts with '=' (formula trigger) AND contains a comma (RFC4180 quote)
    expect(escapeCsvField('=HYPERLINK("http://evil","x")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""x"")"'
    )
  })

  it('does not prefix a value whose trigger char is not leading', () => {
    expect(escapeCsvField('a=1')).toBe('a=1')
    expect(escapeCsvField('1-2')).toBe('1-2')
  })
})

describe('buildCsv', () => {
  it('prepends a UTF-8 BOM (U+FEFF)', () => {
    const csv = buildCsv(['a'], [['1']])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('joins cells with comma and rows with CRLF', () => {
    const csv = buildCsv(
      ['h1', 'h2'],
      [
        ['a', 'b'],
        ['c', 'd']
      ]
    )
    expect(csv).toBe('\uFEFFh1,h2\r\na,b\r\nc,d')
  })

  it('escapes cells while assembling', () => {
    const csv = buildCsv(['名称'], [['张三,李四']])
    expect(csv).toBe('\uFEFF名称\r\n"张三,李四"')
  })

  it('handles an empty rows array (headers only)', () => {
    expect(buildCsv(['a', 'b'], [])).toBe('\uFEFFa,b')
  })
})

describe('downloadCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('creates an <a download>, clicks it, cleans up the DOM, and revokes the url', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    // jsdom does not implement these by default
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    const click = vi.fn()
    let anchor: HTMLAnchorElement | null = null
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag)
      if (tag === 'a') {
        anchor = el as HTMLAnchorElement
        anchor.click = click
      }
      return el
    })
    const removeChild = vi.spyOn(document.body, 'removeChild')

    downloadCsv('费用对账_2026-06.csv', '\uFEFFa\r\n1')

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    // anchor must be detached from the DOM (no leak)
    expect(removeChild).toHaveBeenCalledWith(anchor)
    expect(anchor && document.body.contains(anchor)).toBe(false)
    // revoke is deferred — not yet called synchronously, fires on the next tick
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})
