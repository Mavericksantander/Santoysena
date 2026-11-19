// Lee el buzón de pruebas del Supabase local para sacar el código de inicio
// de sesión del correo que realmente se envió.

const base = (process.env.MAILPIT_URL ?? process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324').replace(/\/$/, '')

export interface Mail {
  subject: string
  html: string
  text: string
}

async function json(url: string): Promise<unknown> {
  const response = await fetch(url)
  return response.ok ? response.json() : null
}

async function fromMailpit(email: string): Promise<Mail | null> {
  const found = (await json(`${base}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)) as {
    messages?: { ID: string }[]
  } | null
  const id = found?.messages?.[0]?.ID
  if (!id) return null
  const message = (await json(`${base}/api/v1/message/${id}`)) as {
    Subject: string
    HTML: string
    Text: string
  } | null
  return message ? { subject: message.Subject, html: message.HTML, text: message.Text } : null
}

async function fromInbucket(email: string): Promise<Mail | null> {
  const mailbox = email.split('@')[0]!
  const list = (await json(`${base}/api/v1/mailbox/${mailbox}`)) as { id: string }[] | null
  const id = list?.at(-1)?.id
  if (!id) return null
  const message = (await json(`${base}/api/v1/mailbox/${mailbox}/${id}`)) as {
    subject: string
    body: { html: string; text: string }
  } | null
  return message ? { subject: message.subject, html: message.body.html, text: message.body.text } : null
}

/** Espera hasta 20 segundos a que llegue el correo para esa dirección. */
export async function latestMailTo(email: string): Promise<Mail> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const mail = (await fromMailpit(email)) ?? (await fromInbucket(email))
    if (mail) return mail
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`No llegó ningún correo para ${email} al buzón de pruebas en ${base}`)
}

/** El código es el único número de 6 cifras que aparece como texto del correo. */
export function codeIn(mail: Mail): string {
  const match = />\s*(\d{6})\s*</.exec(mail.html) ?? /(?<![\d#])(\d{6})(?!\d)/.exec(mail.text)
  if (!match) throw new Error('El correo no trae un código de 6 cifras')
  return match[1]!
}
