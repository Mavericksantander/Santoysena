// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App.tsx'
import { demoAuth, demoSource } from './data/demo.ts'
import { expiryTime } from './data/format.ts'
import { LONGEST_WAIT_MS, RETRY_WHEN_ALREADY_DUE_MS } from './data/useLoad.ts'
import type { Auth, Session } from './auth/auth.ts'
import { type DailyCode, type DataSource, type Family, RequestError } from './data/source.ts'
import { pendingInvitation } from './invitation.ts'

const FAMILY: Family = { id: 'f1', name: 'Familia Pérez Soto', role: 'admin' }
const TOKEN = 'k'.repeat(43)
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
    createFamily: () => Promise.resolve(),
    createInvitation: () => Promise.resolve({ token: TOKEN, expiresAt: new Date('2099-01-01T03:00:00Z') }),
    acceptInvitation: () => Promise.resolve(),
    ...overrides,
  }
}

/** Sesión falsa: el único código de correo que acepta es 123456. */
function fakeAuth(initial: Session | null) {
  let session = initial
  const listeners = new Set<(session: Session | null) => void>()
  const change = (next: Session | null) => {
    session = next
    for (const listener of listeners) listener(next)
  }
  const auth = {
    current: () => Promise.resolve(session),
    subscribe: (listener: (session: Session | null) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    requestCode: vi.fn<Auth['requestCode']>(() => Promise.resolve()),
    verifyCode: vi.fn<Auth['verifyCode']>((_email, code) => {
      if (code !== '123456') return Promise.reject(new RequestError('otp_expired'))
      change({ userId: '1' })
      return Promise.resolve()
    }),
    signOut: vi.fn<Auth['signOut']>(() => {
      change(null)
      return Promise.resolve()
    }),
  }
  return auth satisfies Auth
}
const signedIn = () => fakeAuth({ userId: '1' })
const signedOut = () => fakeAuth(null)

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** Deja la dirección ya puesta antes de montar la aplicación, como al abrir un enlace desde otra app. */
async function openedFrom(hash: string) {
  window.location.hash = hash
  await new Promise((resolve) => setTimeout(resolve))
}

beforeEach(() => {
  window.location.hash = ''
  sessionStorage.clear()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('pantalla principal', () => {
  test('muestra la familia, las dos palabras del código y hasta cuándo vale', async () => {
    render(<App auth={signedIn()} source={source()} />)
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
    expect(screen.getByText('PLANEADOR')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'SANTO Y SEÑA' })).toBeTruthy()
    expect(screen.getByText('Familia Pérez Soto')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Código de hoy' })).toBeTruthy()
    expect(screen.getByText('Válido hasta las 00:00')).toBeTruthy()
  })

  test('el código es el texto más grande de la pantalla', async () => {
    render(<App auth={signedIn()} source={source()} />)
    await screen.findByText('COPIHUE')
    const classes = screen.getByTestId('codigo').className
    expect(classes).toContain('text-[clamp(2.25rem,12vw,4.5rem)]')
    expect(classes).toContain('font-black')
  })

  test('recuerda que el código no se dice', async () => {
    render(<App auth={signedIn()} source={source()} />)
    expect(await screen.findByText('Nunca digas este código. Pídeselo a quien te llama.')).toBeTruthy()
  })

  test('mientras carga lo dice, y no muestra ninguna palabra', () => {
    render(<App auth={signedIn()} source={source({ getFamilyCode: () => new Promise(() => {}) })} />)
    expect(screen.getByRole('status').textContent).toContain('Cargando')
    expect(screen.queryByTestId('codigo')).toBeNull()
  })

  test('si falla la carga lo explica y permite reintentar', async () => {
    const getFamilyCode = vi
      .fn<DataSource['getFamilyCode']>()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValue(code())
    render(<App auth={signedIn()} source={source({ getFamilyCode })} />)
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar el código')
    expect(screen.queryByTestId('codigo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
  })

  test('sin familia lo dice en vez de mostrar un código', async () => {
    render(<App auth={signedIn()} source={source({ listFamilies: () => Promise.resolve([]) })} />)
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
    render(<App auth={signedIn()} source={source({ getFamilyCode })} />)
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
    render(<App auth={signedIn()} source={source({ getFamilyCode })} />)
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
    render(<App auth={signedIn()} source={source({ getFamilyCode })} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(() => vi.advanceTimersByTimeAsync(LONGEST_WAIT_MS - 1))
    expect(getFamilyCode).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(getFamilyCode).toHaveBeenCalledTimes(2)
  })

  test('al volver a la aplicación pide el código de nuevo', async () => {
    const getFamilyCode = vi.fn<DataSource['getFamilyCode']>().mockResolvedValue(code())
    render(<App auth={signedIn()} source={source({ getFamilyCode })} />)
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
    render(<App auth={signedIn()} source={source()} />)
    await screen.findByText('COPIHUE')
    expect(screen.getByRole('link', { name: 'VER INSTRUCCIONES' }).getAttribute('href')).toBe('#/instrucciones')
    expect(screen.getByRole('link', { name: 'MI FAMILIA' }).getAttribute('href')).toBe('#/familia')
  })

  test('instrucciones muestra las cinco reglas y cómo volver', async () => {
    render(<App auth={signedIn()} source={source()} />)
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
    render(<App auth={signedIn()} source={source()} />)
    await screen.findByText('COPIHUE')
    await goTo('#/instrucciones')
    expect(screen.queryByText('COPIHUE')).toBeNull()
  })

  test('mi familia lista a los miembros con su rol', async () => {
    render(<App auth={signedIn()} source={source()} />)
    await goTo('#/familia')
    expect(await screen.findByText('Abuela Rosa')).toBeTruthy()
    const rows = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(rows).toEqual(['Abuela RosaCreó la familia', 'PedroAdministra', 'CamilaMiembro'])
  })
})

describe('modo muestra', () => {
  test('avisa en todas las pantallas que el código no es real', async () => {
    render(<App auth={demoAuth()} source={demoSource()} />)
    for (const hash of ['', '#/instrucciones', '#/familia']) {
      await goTo(hash)
      expect(screen.getByRole('note').textContent).toBe(
        'MUESTRA: datos de ejemplo. Este código no protege a nadie.',
      )
    }
  })

  test('con datos reales no aparece el aviso de muestra', async () => {
    render(<App auth={signedIn()} source={source()} />)
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

describe('inicio de sesión', () => {
  test('sin sesión no se muestra ningún código ni se le pide nada al servidor', async () => {
    const getFamilyCode = vi.fn<DataSource['getFamilyCode']>().mockResolvedValue(code())
    const listFamilies = vi.fn<DataSource['listFamilies']>().mockResolvedValue([FAMILY])
    render(<App auth={signedOut()} source={source({ getFamilyCode, listFamilies })} />)
    expect(await screen.findByLabelText('Tu correo')).toBeTruthy()
    expect(screen.queryByTestId('codigo')).toBeNull()
    expect(getFamilyCode).not.toHaveBeenCalled()
    expect(listFamilies).not.toHaveBeenCalled()
  })

  test('con nombre y correo pide el código, y con el código correcto entra', async () => {
    const auth = signedOut()
    render(<App auth={auth} source={source()} />)
    await screen.findByLabelText('Tu correo')
    type(/Tu nombre/, '  Abuela Rosa ')
    type('Tu correo', ' rosa@example.com ')
    press('ENVIARME UN CÓDIGO')
    expect(await screen.findByLabelText('Código del correo')).toBeTruthy()
    expect(auth.requestCode).toHaveBeenCalledWith('rosa@example.com', 'Abuela Rosa')
    expect(screen.getByText('rosa@example.com')).toBeTruthy()

    type('Código del correo', '123456')
    press('ENTRAR')
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
    expect(auth.verifyCode).toHaveBeenCalledWith('rosa@example.com', '123456')
  })

  test('un código equivocado lo dice y no deja entrar', async () => {
    render(<App auth={signedOut()} source={source()} />)
    await screen.findByLabelText('Tu correo')
    type(/Tu nombre/, 'Rosa')
    type('Tu correo', 'rosa@example.com')
    press('ENVIARME UN CÓDIGO')
    await screen.findByLabelText('Código del correo')
    type('Código del correo', '000000')
    press('ENTRAR')
    expect((await screen.findByRole('alert')).textContent).toContain('no es correcto o ya venció')
    expect(screen.queryByTestId('codigo')).toBeNull()
  })

  test('si no se puede enviar el código lo dice y se queda en el primer paso', async () => {
    const auth = signedOut()
    auth.requestCode.mockRejectedValue(new RequestError('over_email_send_rate_limit'))
    render(<App auth={auth} source={source()} />)
    await screen.findByLabelText('Tu correo')
    type(/Tu nombre/, 'Rosa')
    type('Tu correo', 'rosa@example.com')
    press('ENVIARME UN CÓDIGO')
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos enviar el código')
    expect(screen.queryByLabelText('Código del correo')).toBeNull()
  })

  test('el campo del código es numérico y lo puede rellenar el teléfono', async () => {
    render(<App auth={signedOut()} source={source()} />)
    await screen.findByLabelText('Tu correo')
    type(/Tu nombre/, 'Rosa')
    type('Tu correo', 'rosa@example.com')
    press('ENVIARME UN CÓDIGO')
    const field = await screen.findByLabelText('Código del correo')
    expect(field.getAttribute('inputmode')).toBe('numeric')
    expect(field.getAttribute('autocomplete')).toBe('one-time-code')
  })

  test('cerrar sesión vuelve al ingreso y deja de mostrar el código', async () => {
    const auth = signedIn()
    render(<App auth={auth} source={source()} />)
    await screen.findByText('COPIHUE')
    await goTo('#/familia')
    await screen.findByText('Abuela Rosa')
    press('CERRAR SESIÓN')
    expect(await screen.findByLabelText('Tu correo')).toBeTruthy()
    expect(auth.signOut).toHaveBeenCalledOnce()
    await goTo('')
    expect(screen.queryByText('COPIHUE')).toBeNull()
  })
})

describe('sin familia', () => {
  test('ofrece crear una, y al crearla muestra su código', async () => {
    const families: Family[] = []
    const createFamily = vi.fn<DataSource['createFamily']>((name) => {
      families.push({ id: 'f1', name, role: 'admin' })
      return Promise.resolve()
    })
    render(<App auth={signedIn()} source={source({ listFamilies: () => Promise.resolve([...families]), createFamily })} />)
    expect(await screen.findByText('Todavía no perteneces a ninguna familia.')).toBeTruthy()
    type('Nombre de la familia', '  Familia Soto ')
    press('CREAR FAMILIA')
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
    expect(createFamily).toHaveBeenCalledWith('Familia Soto')
    expect(screen.getByText('Familia Soto')).toBeTruthy()
  })

  test('si no se puede crear lo dice', async () => {
    const createFamily = () => Promise.reject(new RequestError('network_error'))
    render(<App auth={signedIn()} source={source({ listFamilies: () => Promise.resolve([]), createFamily })} />)
    await screen.findByText('Todavía no perteneces a ninguna familia.')
    type('Nombre de la familia', 'Familia Soto')
    press('CREAR FAMILIA')
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos crear la familia')
  })
})

describe('invitaciones', () => {
  test('quien administra crea una invitación y el token va en el fragmento del enlace', async () => {
    const createInvitation = vi.fn(source().createInvitation)
    render(<App auth={signedIn()} source={source({ createInvitation })} />)
    await goTo('#/familia')
    await screen.findByText('Abuela Rosa')
    press('CREAR INVITACIÓN')
    const link = (await screen.findByTestId('enlace')).textContent!
    expect(createInvitation).toHaveBeenCalledWith('f1')
    expect(new URL(link).hash).toBe(`#/unirse/${TOKEN}`)
    expect(new URL(link).search).toBe('')
    expect(new URL(link).pathname).not.toContain(TOKEN)
    expect(screen.getByText(/Sirve una sola vez y vence en 24 horas/)).toBeTruthy()
  })

  test('un miembro regular no ve la opción de invitar', async () => {
    const member: Family = { ...FAMILY, role: 'member' }
    render(<App auth={signedIn()} source={source({ listFamilies: () => Promise.resolve([member]) })} />)
    await goTo('#/familia')
    await screen.findByText('Abuela Rosa')
    expect(screen.queryByRole('button', { name: 'CREAR INVITACIÓN' })).toBeNull()
  })

  test('abrir un enlace de invitación sin sesión: se guarda, se saca de la barra y se ofrece al entrar', async () => {
    await openedFrom(`#/unirse/${TOKEN}`)
    const acceptInvitation = vi.fn<DataSource['acceptInvitation']>(() => Promise.resolve())
    render(<App auth={signedOut()} source={source({ acceptInvitation })} />)
    await screen.findByLabelText('Tu correo')
    expect(window.location.hash).toBe('#/')
    expect(pendingInvitation.get()).toBe(TOKEN)
    expect(acceptInvitation).not.toHaveBeenCalled()

    type(/Tu nombre/, 'Camila')
    type('Tu correo', 'camila@example.com')
    press('ENVIARME UN CÓDIGO')
    await screen.findByLabelText('Código del correo')
    type('Código del correo', '123456')
    press('ENTRAR')

    expect(await screen.findByText('Te invitaron a una familia')).toBeTruthy()
    expect(acceptInvitation).not.toHaveBeenCalled()
    press('UNIRME A LA FAMILIA')
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
    expect(acceptInvitation).toHaveBeenCalledWith(TOKEN)
    expect(pendingInvitation.get()).toBeNull()
  })

  test('nadie queda unido a una familia sin apretar el botón', async () => {
    await openedFrom(`#/unirse/${TOKEN}`)
    const acceptInvitation = vi.fn<DataSource['acceptInvitation']>(() => Promise.resolve())
    render(<App auth={signedIn()} source={source({ acceptInvitation })} />)
    await screen.findByText('Te invitaron a una familia')
    press('NO, GRACIAS')
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
    expect(acceptInvitation).not.toHaveBeenCalled()
    expect(pendingInvitation.get()).toBeNull()
  })

  test('una invitación usada o vencida lo explica y no muestra ningún código', async () => {
    await openedFrom(`#/unirse/${TOKEN}`)
    const acceptInvitation = () => Promise.reject(new RequestError('invitation_invalid'))
    render(<App auth={signedIn()} source={source({ acceptInvitation })} />)
    await screen.findByText('Te invitaron a una familia')
    press('UNIRME A LA FAMILIA')
    expect((await screen.findByRole('alert')).textContent).toContain('Esta invitación ya no sirve')
    expect(screen.queryByTestId('codigo')).toBeNull()
  })

  test('si la invitación llega con la aplicación ya abierta, también se ofrece', async () => {
    render(<App auth={signedIn()} source={source()} />)
    await screen.findByText('COPIHUE')
    await goTo(`#/unirse/${TOKEN}`)
    expect(await screen.findByText('Te invitaron a una familia')).toBeTruthy()
    expect(window.location.hash).toBe('#/')
  })

  test('un enlace con un token de mala forma se ignora', async () => {
    await openedFrom('#/unirse/<script>alert(1)</script>')
    render(<App auth={signedIn()} source={source()} />)
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
    expect(pendingInvitation.get()).toBeNull()
  })
})

describe('varias familias', () => {
  const second: Family = { id: 'f2', name: 'Familia Pakarati', role: 'member' }

  test('se puede cambiar de familia, y el código que se pide es el de la elegida', async () => {
    const getFamilyCode = vi.fn<DataSource['getFamilyCode']>((familyId) =>
      Promise.resolve(familyId === 'f2' ? code({ familyId, wordOne: 'VOLCÁN', wordTwo: 'BRÚJULA' }) : code()),
    )
    render(
      <App auth={signedIn()} source={source({ listFamilies: () => Promise.resolve([FAMILY, second]), getFamilyCode })} />,
    )
    expect(await screen.findByText('COPIHUE')).toBeTruthy()
    await goTo('#/familia')
    press('Familia Pakarati')
    await goTo('#/')
    expect(await screen.findByText('VOLCÁN')).toBeTruthy()
    expect(screen.getByText('Familia Pakarati')).toBeTruthy()
    expect(screen.queryByText('COPIHUE')).toBeNull()
  })
})
