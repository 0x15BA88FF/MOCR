import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Telescope, KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function Login() {
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!password) {
      toast.error("Please enter the password or API key")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success("Successfully logged in")
        navigate("/telescope", { replace: true })
      } else {
        toast.error(data.error || "Invalid password")
      }
    } catch {
      toast.error("Connection failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh text-foreground flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-md border border-border bg-card p-6">
        <div className="flex flex-col mb-3">
          <div className="size-10 border border-border bg-background flex items-center justify-center text-primary mb-3">
            <Telescope className="size-5" />
          </div>
          <h1 className="text-sm font-semibold tracking-wider uppercase text-foreground">MOCR Access Control</h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-1.5">
              Password or API key
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-muted-foreground">
                <KeyRound className="size-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="*************"
                className="h-9 w-full border border-input bg-background pl-9 pr-3 text-xs text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-9 w-full items-center justify-center gap-2 border border-border text-xs font-medium tracking-wider uppercase text-foreground transition-colors hover:border-primary hover:text-primary cursor-pointer disabled:opacity-60"
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            Authenticate
          </button>
        </form>
      </div>
    </div>
  )
}
