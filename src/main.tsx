import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { AccountGate } from '@/components/auth/AccountGate'
import { NoticeHost } from '@/components/shared/NoticeHost'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AccountGate><App /></AccountGate>
      <NoticeHost />
    </ErrorBoundary>
  </StrictMode>,
)
