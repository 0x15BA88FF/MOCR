import { Satellite } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SloohTelescope } from "@/lib/slooh"

function TelescopeButton({
  t,
  selected,
  onToggle,
}: {
  t: SloohTelescope
  selected: boolean
  onToggle: (t: SloohTelescope) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(t)}
      aria-pressed={selected}
      title={t.telescopeName}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 border px-2 py-1.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border bg-card hover:border-primary/50",
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          t.online ? "bg-emerald-400" : "bg-red-400",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">
          {t.telescopeName}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {t.obsName}
        </span>
      </span>
      <span className="shrink-0 text-[9px] tracking-wider text-muted-foreground uppercase">
        {t.feedType ?? t.status}
      </span>
    </button>
  )
}

export function TelescopesSection({
  telescopes,
  selected,
  onToggle,
  error,
}: {
  telescopes: SloohTelescope[]
  selected: Set<string>
  onToggle: (t: SloohTelescope) => void
  error: string | null
}) {
  const online = telescopes.filter((t) => t.online)
  const offline = telescopes.filter((t) => !t.online)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <Satellite className="size-3.5" />
          Telescopes
        </span>
        <span className="text-[10px] text-muted-foreground">
          {online.length}/{telescopes.length} online
        </span>
      </div>
      {error ? (
        <p className="border border-red-900/60 bg-red-950/30 px-2 py-1.5 text-[10px] leading-relaxed text-red-300">
          proxy unavailable ({error}). Start the server with{" "}
          <code className="text-red-200">pnpm dev:server</code>.
        </p>
      ) : null}
      {telescopes.length === 0 && !error ? (
        <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
          loading telescopes…
        </p>
      ) : null}
      {online.map((t) => (
        <TelescopeButton
          key={t.teleUniqueId}
          t={t}
          selected={selected.has(t.teleUniqueId)}
          onToggle={onToggle}
        />
      ))}
      {offline.length > 0 ? (
        <span className="mt-1 text-[9px] tracking-widest text-muted-foreground/60 uppercase">
          offline
        </span>
      ) : null}
      {offline.map((t) => (
        <TelescopeButton
          key={t.teleUniqueId}
          t={t}
          selected={selected.has(t.teleUniqueId)}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}
