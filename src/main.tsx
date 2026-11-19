import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { demoSource } from './data/demo.ts'

// Mientras no exista la conexión con el servidor, la aplicación solo corre en modo muestra.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App source={demoSource()} />
  </StrictMode>,
)
