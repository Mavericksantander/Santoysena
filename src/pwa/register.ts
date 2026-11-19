/**
 * Registra el service worker que permite abrir la aplicación sin conexión.
 * `container` no existe en navegadores sin soporte ni fuera de HTTPS.
 */
export function registerServiceWorker(
  container: Pick<ServiceWorkerContainer, 'register'> | undefined,
  base: string,
): void {
  // Sin service worker la aplicación funciona igual, solo que necesita conexión para abrir.
  container?.register(`${base}sw.js`).catch(() => {})
}
