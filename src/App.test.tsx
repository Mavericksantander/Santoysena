// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App.tsx'
import { demoSource } from './data/demo.ts'
import { expiryTime } from './data/format.ts'
import { LONGEST_WAIT_MS, RETRY_WHEN_ALREADY_DUE_MS } from './data/useLoad.ts'
import type { DailyCode, DataSource } from './data/source.ts'

const FAMILY = { id: 'f1', name: 'Familia Pérez Soto' }
const code = (overrides: Partial<DailyCode> = {}): DailyCode => ({
  familyId: 'f1',
  date: '2098-12-31',
  timezone: 'America/Santiago',
  wordOne: 'COPIHUE',
  wordTwo: 'PLANEADOR',
  // Medianoche de Santiago, lejos en el futuro para que no venza durante un test.
  expiresAt: new Date('2099-01-01T03:00:00Z'),
  ...overrides,
})

function source(overrides: Partial<DataSource> = {}): DataSource {
  return {
    isDemo: false,
    listFamilies: () => Promise.resolve([FAMILY]),
    getFamilyCode: () => Promise.resolve(code()),
    listMembers: () =>
      Promise.resolve([
        { userId: '1', displayName: 'Abuela Rosa', role: 'admin', isOwner: true },
        { userId: '2', displayName: 'Pedro', role: 'admin', isOwner: false },
        { userId: '3', displayName: 'Camila', role: 'member', isOwner: false },
      ]),
    ...overrides,
  }
}

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeEach(() => {
  window.location.hash = ''
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('pantalla principal', () => {
  test('muestra la familia, las dos palabras del código y hasta cuándo vale', async () => {
    render(<App source={source()} />)
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
    expect(screen.getByText('PLANEADOR')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'SANTO Y SEÑA' })).toBeTruthy()
    expect(screen.getByText('Familia Pérez Soto')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Código de hoy' })).toBeTruthy()
    expect(screen.getByText('Válido hasta las 00:00')).toBeTruthy()
  })

  test('el código es el texto más grande de la pantalla', async () => {
    render(<App source={source()} />)
    await screen.findByText('COPIHUE')
    const classes = screen.getByTestId('codigo').className
    expect(classes).toContain('text-[clamp(2.25rem,12vw,4.5rem)]')
    expect(classes).toContain('font-black')
  })

  test('recuerda que el código no se dice', async () => {
    render(<App source={source()} />)
    expect(await screen.findByText('Nunca digas este código. Pídeselo a quien te llama.')).toBeTruthy()
  })

  test('mientras carga lo dice, y no muestra ninguna palabra', () => {
    render(<App source={source({ getFamilyCode: () => new Promise(() => {}) })} />)
    expect(screen.getByRole('status').textContent).toContain('Cargando')
    expect(screen.queryByTestId('codigo')).toBeNull()
  })

  test('si falla la carga lo explica y permite reintentar', async () => {
    const getFamilyCode = vi
      .fn<DataSource['getFamilyCode']>()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValue(code())
    render(<App source={source({ getFamilyCode })} />)
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar el código')
    expect(screen.queryByTestId('codigo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
  })

  test('sin familia lo dice en vez de mostrar un código', async () => {
    render(<App source={source({ listFamilies: () => Promise.resolve([]) })} />)
    expect(await screen.findByText('Todavía no perteneces a ninguna familia.')).toBeTruthy()
    expect(screen.queryByTestId('codigo')).toBeNull()
  })

  test('cuando el código vence, pide el nuevo sin que nadie toque nada', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date('2026-11-19T02:59:00Z'))
    const getFamilyCode = vi
      .fn<DataSource['getFamilyCode']>()
      .mockResolvedValueOnce(code({ date: '2026-11-18', expiresAt: new Date('2026-11-19T03:00:00Z') }))
      .mockResolvedValue(
        code({ date: '2026-11-19', wordOne: 'VOLCÁN', wordTwo: 'BRÚJULA', expiresAt: new Date('2026-11-20T03:00:00Z') }),
      )
    render(<App source={source({ getFamilyCode })} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByText('COPIHUE')).toBeTruthy()

    await act(() => vi.advanceTimersByTimeAsync(59_000))
    expect(screen.getByText('COPIHUE')).toBeTruthy()
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(screen.getByText('VOLCÁN')).toBeTruthy()
    expect(screen.queryByText('COPIHUE')).toBeNull()
  })

  test('si el teléfono cree que el código ya venció, espera antes de volver a pedirlo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date('2026-11-19T03:02:00Z'))
    const stillYesterday = code({ date: '2026-11-18', expiresAt: new Date('2026-11-19T03:00:00Z') })
    const getFamilyCode = vi.fn<DataSource['getFamilyCode']>().mockResolvedValue(stillYesterday)
    render(<App source={source({ getFamilyCode })} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(getFamilyCode).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(RETRY_WHEN_ALREADY_DUE_MS - 1))
    expect(getFamilyCode).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(getFamilyCode).toHaveBeenCalledTimes(2)
  })

  test('con un vencimiento muy lejano espera, como mucho, una hora', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const getFamilyCode = vi.fn<DataSource['getFamilyCode']>().mockResolvedValue(code())
    render(<App source={source({ getFamilyCode })} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(() => vi.advanceTimersByTimeAsync(LONGEST_WAIT_MS - 1))
    expect(getFamilyCode).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(getFamilyCode).toHaveBeenCalledTimes(2)
  })

  test('al volver a la aplicación pide el código de nuevo', async () => {
    const getFamilyCode = vi.fn<DataSource['getFamilyCode']>().mockResolvedValue(code())
    render(<App source={source({ getFamilyCode })} />)
    await screen.findByText('COPIHUE')
    expect(getFamilyCode).toHaveBeenCalledTimes(1)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(getFamilyCode).toHaveBeenCalledTimes(2))
  })
})

describe('hora de vencimiento', () => {
  test('se muestra en la zona de la familia, no en la del teléfono', () => {
    expect(expiryTime(new Date('2026-11-19T03:00:00Z'), 'America/Santiago')).toBe('00:00')
    expect(expiryTime(new Date('2026-11-19T15:00:00Z'), 'Asia/Tokyo')).toBe('00:00')
  })

  test('el día en que empieza el horario de verano dice 01:00', () => {
    expect(expiryTime(new Date('2027-09-05T04:00:00Z'), 'America/Santiago')).toBe('01:00')
  })
})

describe('navegación', () => {
  test('los dos botones grandes llevan a instrucciones y a la familia', async () => {
    render(<App source={source()} />)
    await screen.findByText('COPIHUE')
    expect(screen.getByRole('link', { name: 'VER INSTRUCCIONES' }).getAttribute('href')).toBe('#/instrucciones')
    expect(screen.getByRole('link', { name: 'MI FAMILIA' }).getAttribute('href')).toBe('#/familia')
  })

  test('instrucciones muestra las cinco reglas y cómo volver', async () => {
    render(<App source={source()} />)
    await goTo('#/instrucciones')
    expect(screen.getByRole('heading', { level: 1, name: 'INSTRUCCIONES' })).toBeTruthy()
    const rules = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(rules).toHaveLength(5)
    expect(rules[0]).toContain('Nunca digas el código')
    expect(rules[1]).toContain('Pide a quien dice ser tu familiar')
    expect(rules[2]).toContain('Nunca aceptes un código antiguo')
    expect(rules[3]).toContain('no está verificado')
    expect(rules[4]).toContain('llama tú a tu familiar a un número que ya conocías')
    expect(screen.getByRole('link', { name: /Volver/ }).getAttribute('href')).toBe('#/')
  })

  test('las instrucciones no muestran el código', async () => {
    render(<App source={source()} />)
    await screen.findByText('COPIHUE')
    await goTo('#/instrucciones')
    expect(screen.queryByText('COPIHUE')).toBeNull()
  })

  test('mi familia lista a los miembros con su rol', async () => {
    render(<App source={source()} />)
    await goTo('#/familia')
    expect(await screen.findByText('Abuela Rosa')).toBeTruthy()
    const rows = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(rows).toEqual(['Abuela RosaCreó la familia', 'PedroAdministra', 'CamilaMiembro'])
  })
})

describe('modo muestra', () => {
  test('avisa en todas las pantallas que el código no es real', async () => {
    render(<App source={demoSource()} />)
    for (const hash of ['', '#/instrucciones', '#/familia']) {
      await goTo(hash)
      expect(screen.getByRole('note').textContent).toBe(
        'MUESTRA: datos de ejemplo. Este código no protege a nadie.',
      )
    }
  })

  test('con datos reales no aparece el aviso de muestra', async () => {
    render(<App source={source()} />)
    await screen.findByText('COPIHUE')
    expect(screen.queryByRole('note')).toBeNull()
  })

  test('la fuente de muestra cambia de código a la medianoche de Santiago', async () => {
    const at = (iso: string) => demoSource(() => new Date(iso)).getFamilyCode('muestra')
    const before = await at('2026-11-19T02:59:59Z')
    const after = await at('2026-11-19T03:00:00Z')
    expect(before.date).toBe('2026-11-18')
    expect(before.expiresAt.toISOString()).toBe('2026-11-19T03:00:00.000Z')
    expect(after.date).toBe('2026-11-19')
    expect([after.wordOne, after.wordTwo]).not.toEqual([before.wordOne, before.wordTwo])
  })
})
