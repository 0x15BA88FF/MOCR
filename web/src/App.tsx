import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { Toaster } from "./components/ui/sonner"
import Telescope from "./pages/Telescope"
import Login from "./pages/Login"
import { Loader2 } from "lucide-react"

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(true)
  const location = useLocation()

  useEffect(() => {
    let mounted = true
    fetch("/api/auth/status")
      .then((res) => {
        if (res.status === 401) {
          return { authRequired: true, authenticated: false }
        }
        return res.json()
      })
      .then((data: any) => {
        if (!mounted) return
        if (data.authRequired && !data.authenticated) {
          fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
          setAuthenticated(false)
        } else {
          setAuthenticated(true)
        }
      })
      .catch(() => { })
      .finally(() => {
        if (mounted) setChecking(false)
      })
    return () => {
      mounted = false
    }
  }, [location.pathname])

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center font-mono">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/telescope"
          element={
            <AuthGuard>
              <Telescope />
            </AuthGuard>
          }
        />
        <Route path="/" element={<Navigate to="/telescope" replace />} />
      </Routes>
      <Toaster position="bottom-left" />
    </BrowserRouter>
  )
}

export default App
