export interface Session {
  userId: string
}

/** Inicio de sesión con un código de un solo uso enviado por correo. No hay contraseñas. */
export interface Auth {
  current(): Promise<Session | null>
  /** Avisa cada vez que la sesión empieza o termina. Devuelve cómo dejar de escuchar. */
  subscribe(listener: (session: Session | null) => void): () => void
  requestCode(email: string, displayName: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
}
