import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import AppsPage from './pages/AppsPage'
import DocsPage from './pages/DocsPage'
import PkgsPage from './pages/PkgsPage'
import SettingsPage from './pages/SettingsPage'
import { ToastProvider } from './components/ui/toast'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/apps" replace />} />
            <Route path="/apps" element={<AppsPage />} />
            <Route path="/pkgs" element={<PkgsPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
