"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Chip, ChipTone } from "@/lib/dashboard/chips";
import { cn } from "@/lib/utils";

const TONE: Record<ChipTone, string> = {
  neutral: "border-border bg-muted/60 text-foreground",
  good: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  bad: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

// Hover on desktop, tap on phones: the popover shows the quote or rule behind the chip.
export function InsightChip({ chip }: { chip: Chip }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        render={
          <button
            type="button"
            className={cn(
              "inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
              TONE[chip.tone],
            )}
          />
        }
      >
        {chip.label}
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] text-sm">
        <p className="mb-1.5 font-medium">{chip.label}</p>
        <ul className="space-y-1.5 text-muted-foreground">
          {chip.evidence.slice(0, 6).map((line, index) => (
            <li key={index} className="leading-snug">
              {line}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// Shows the chips chosen on the server inline; the rest sit behind "+N", each with its evidence.
// Tapping (or hovering) opens the popover, so nothing depends on hover alone.
export function ChipRow({ shown, hidden }: { shown: Chip[]; hidden: Chip[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {shown.map((chip) => (
        <InsightChip key={chip.key} chip={chip} />
      ))}
      {hidden.length > 0 && (
        <Popover>
          <PopoverTrigger
            openOnHover
            delay={150}
            render={
              <button
                type="button"
                aria-label={`${hidden.length} more insights: ${hidden.map((chip) => chip.label).join(", ")}`}
                className="inline-flex min-h-6 items-center rounded-full border border-dashed px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
              />
            }
          >
            +{hidden.length}
          </PopoverTrigger>
          <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] text-sm">
            <ul className="space-y-3">
              {hidden.map((chip) => (
                <li key={chip.key}>
                  <p className="font-medium">{chip.label}</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {chip.evidence.slice(0, 3).map((line, index) => (
                      <li key={index} className="leading-snug">
                        {line}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
