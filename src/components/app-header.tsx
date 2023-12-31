import { Container } from "lucide-react";
import type { ReactNode } from "react";

// The brand mark and title, with the page's actions on the right.
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="anim-fade-up flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.55_0.17_285)] text-primary-foreground shadow-sm ring-1 ring-primary/20"
        >
          <Container className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Kargo hiring</h1>
          <p className="text-sm text-muted-foreground">Every CV scored against both job descriptions.</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">{children}</div>
    </header>
  );
}
