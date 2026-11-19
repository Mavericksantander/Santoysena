import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { demoAuth, demoSource } from './data/demo.ts'
import { supabaseBackend } from './data/supabase.ts'
import { registerServiceWorker } from './pwa/register.ts'

// Con la URL y la llave publicable de Supabase la aplicación usa el servidor.
// Sin ellas corre en modo muestra, y lo avisa en todas las pantallas.
const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
const publishableKey: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const backend =
  url && publishableKey
    ? supabaseBackend(url, publishableKey)
    : { auth: demoAuth(), source: demoSource() }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App auth={backend.auth} source={backend.source} />
  </StrictMode>,
)

// En desarrollo no se registra: guardaría archivos que cambian a cada rato.
if (import.meta.env.PROD) registerServiceWorker(navigator.serviceWorker, import.meta.env.BASE_URL)
