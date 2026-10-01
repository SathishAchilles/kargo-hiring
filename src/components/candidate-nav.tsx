"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Neighbours } from "@/lib/dashboard/queries";
import type { RoleKey } from "@/lib/types";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

// "3 of 50", previous and next, and ← → keys, so the ranking can be reviewed in order. Each
// candidate opens in the role they applied for; `from` only keeps the ranking they came from.
export function CandidateNav({ neighbours, from }: { neighbours: Neighbours; from: RoleKey }) {
  const router = useRouter();
  const nav = useRef<HTMLElement>(null);
  const href = (id: string) => `/candidates/${id}?from=${from}`;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isTyping(event.target)) return;
      if (event.key === "ArrowLeft" && neighbours.prev) router.push(href(neighbours.prev.id));
      if (event.key === "ArrowRight" && neighbours.next) router.push(href(neighbours.next.id));
    };
    window.addEventListener("keydown", onKey);
    const element = nav.current;
    element?.setAttribute("data-keys", "on"); // lets tests (and curious people) know the shortcuts are live
    return () => {
      window.removeEventListener("keydown", onKey);
      element?.removeAttribute("data-keys");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighbours.prev?.id, neighbours.next?.id, from, router]);

  const base = "inline-flex min-h-8 items-center gap-0.5 rounded-md border px-2 text-xs";
  return (
    <nav ref={nav} aria-label="Candidates in ranking order" className="flex items-center gap-2 text-muted-foreground">
      {neighbours.prev ? (
        <Link href={href(neighbours.prev.id)} className={`${base} hover:bg-muted hover:text-foreground`} title={`Previous: ${neighbours.prev.name} (←)`}>
          <ChevronLeft className="size-3.5" aria-hidden />
          Previous<span className="sr-only">: {neighbours.prev.name}</span>
        </Link>
      ) : (
        <span aria-hidden className={`${base} opacity-40`}>
          <ChevronLeft className="size-3.5" />
          Previous
        </span>
      )}
      <span className="text-xs tabular-nums">
        {neighbours.position} of {neighbours.of}
      </span>
      {neighbours.next ? (
        <Link href={href(neighbours.next.id)} className={`${base} hover:bg-muted hover:text-foreground`} title={`Next: ${neighbours.next.name} (→)`}>
          Next<span className="sr-only">: {neighbours.next.name}</span>
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={`${base} opacity-40`}>
          Next
          <ChevronRight className="size-3.5" />
        </span>
      )}
    </nav>
  );
}
