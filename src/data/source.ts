// Todo lo que la interfaz sabe del servidor pasa por esta interfaz. Hoy la
// implementa la fuente de muestra; la real llamará a las Edge Functions.

export interface Family {
  id: string
  name: string
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
  role: 'admin' | 'member'
  isOwner: boolean
}

export interface DataSource {
  /** Verdadero cuando los datos son de ejemplo. La interfaz lo avisa en cada pantalla. */
  readonly isDemo: boolean
  listFamilies(): Promise<Family[]>
  getFamilyCode(familyId: string): Promise<DailyCode>
  listMembers(familyId: string): Promise<Member[]>
}
