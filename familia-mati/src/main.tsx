import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ensureFamiliaServiceWorker } from './lib/registerPwa'
import './index.css'

// Register SW ASAP so iOS Home Screen can subscribe to Web Push.
ensureFamiliaServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
