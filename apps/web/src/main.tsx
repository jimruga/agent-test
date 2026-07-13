import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { FeatureFlagProvider } from './lib/feature-flags'

// Bootstrap. The enabled-flag set is served by the API at load (e.g. bundled with
// /me); the skeleton starts dark (empty set) until that fetch is wired by the
// frontend-engineer. Never trust this for security — the API gates dark routes.
const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

createRoot(root).render(
  <StrictMode>
    <FeatureFlagProvider enabled={[]}>
      <App />
    </FeatureFlagProvider>
  </StrictMode>,
)
