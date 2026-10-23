import { LoaderCircle } from "lucide-react";

export function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="panel p-6" role="status" aria-busy="true">
      <p className="flex items-center gap-2 text-xs text-[var(--secondary)]">
        <LoaderCircle size={16} className="motion-spinner" aria-hidden="true" />
        {label}
      </p>
      <div aria-hidden="true" className="mt-6 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="loading-surface h-24 rounded-md bg-[var(--muted)]" />
        ))}
      </div>
    </div>
  );
}
