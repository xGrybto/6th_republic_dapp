export function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <span className="cursor-help select-none text-[var(--fr-muted)] opacity-40 transition hover:opacity-80">
        ⓘ
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-xl border border-[var(--fr-border)] bg-[var(--fr-panel-strong)] px-3 py-2 text-xs text-[var(--fr-muted)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}
