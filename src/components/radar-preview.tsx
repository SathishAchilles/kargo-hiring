"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import Link from "next/link";
import { RadarChart } from "@/components/radar-chart";
import { TierBadge } from "@/components/tier-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RADAR_CAPTION } from "@/lib/radar";
import type { Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

export type RadarData = {
  name: string;
  total: number;
  tier: Tier;
  criteria: { id: string; name: string; score: number }[];
};

function RadarBody({ data }: { data: RadarData }) {
  return (
    <div data-testid="radar-preview" className="flex flex-col items-center gap-2">
      <p className="self-stretch text-sm font-medium">{data.name}</p>
      <RadarChart scores={data.criteria.map((item) => item.score)} labels={data.criteria.map((item) => item.id)} size={176} />
      <ul className="w-full space-y-0.5 text-xs">
        {data.criteria.map((item) => (
          <li key={item.id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {item.id} {item.name}
            </span>
            <span className="shrink-0 tabular-nums">{item.score}/5</span>
          </li>
        ))}
      </ul>
      <div className="flex w-full items-center justify-between border-t pt-2">
        <span className="text-sm font-semibold tabular-nums">Total {data.total}</span>
        <TierBadge tier={data.tier} />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{RADAR_CAPTION}</p>
    </div>
  );
}

// The candidate's name. Hovering or focusing it opens the preview; clicking still opens the page.
export function RadarPreviewLink({ href, data, className }: { href: string; data: RadarData; className?: string }) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger render={<Link href={href} className={className} />}>{data.name}</PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner side="right" align="start" sideOffset={8} className="isolate z-50">
          <PreviewCard.Popup
            className={cn(
              "z-50 w-72 origin-(--transform-origin) rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden",
              "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            )}
          >
            <RadarBody data={data} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

// The total. Hovering opens the preview too, and a tap opens it where there is no hover.
export function RadarPreviewTotal({ data, children }: { data: RadarData; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        aria-label={`${data.name}: total ${data.total}. Show the radar chart`}
        className="rounded-full focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent side="left" align="center" className="w-72">
        <RadarBody data={data} />
      </PopoverContent>
    </Popover>
  );
}
