import { type FormEvent, useState } from 'react'
import type { DataSource } from '../data/source.ts'
import { BigButton, Field, Problem, Screen } from '../ui/parts.tsx'

export function NoFamilyScreen({ source, onCreated }: { source: DataSource; onCreated(): void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    try {
      await source.createFamily(name.trim())
      onCreated()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="SANTO Y SEÑA">
      <p className="mt-8 text-xl">Todavía no perteneces a ninguna familia.</p>
      <p className="mt-4 rounded-2xl bg-neutral-100 p-4 text-xl dark:bg-neutral-800">
        Si tu familia ya usa Santo y Seña, pide que te manden una invitación y ábrela en este teléfono.
      </p>
      <form onSubmit={create} className="mt-8 flex flex-col gap-6">
        <h2 className="text-2xl font-extrabold">Crear una familia nueva</h2>
        <Field
          label="Nombre de la familia"
          value={name}
          onChange={setName}
          placeholder="Familia Pérez Soto"
          maxLength={60}
          required
        />
        {failed && <Problem>No pudimos crear la familia. Revisa tu conexión e intenta de nuevo.</Problem>}
        <BigButton type="submit" busy={busy}>
          CREAR FAMILIA
        </BigButton>
      </form>
    </Screen>
  )
}
