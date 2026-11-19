// Todo lo que la interfaz sabe del servidor pasa por estas interfaces. Las
// implementan la fuente de muestra y la conexión real con Supabase.

export type Role = 'admin' | 'member'

export interface Family {
  id: string
  name: string
  /** Rol de quien está mirando dentro de esta familia. */
  role: Role
}

export interface DailyCode {
  familyId: string
  date: string
  timezone: string
  wordOne: string
  wordTwo: string
  /** Primer instante en que este código deja de valer. */
  expiresAt: Date
}

export interface Member {
  userId: string
  displayName: string
  role: Role
  isOwner: boolean
}

export interface Invitation {
  token: string
  expiresAt: Date
}

/** Falla de una petición. `code` es el código estable del servidor (docs/api.md) o `network_error`. */
export class RequestError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export interface DataSource {
  /** Verdadero cuando los datos son de ejemplo. La interfaz lo avisa en cada pantalla. */
  readonly isDemo: boolean
  listFamilies(): Promise<Family[]>
  getFamilyCode(familyId: string): Promise<DailyCode>
  listMembers(familyId: string): Promise<Member[]>
  createFamily(name: string): Promise<void>
  createInvitation(familyId: string): Promise<Invitation>
  acceptInvitation(token: string): Promise<void>
  /** Saca a alguien de la familia. Con el propio `userId`, es salir de ella. */
  removeMember(familyId: string, userId: string): Promise<void>
  setMemberRole(familyId: string, userId: string, role: Role): Promise<void>
}
