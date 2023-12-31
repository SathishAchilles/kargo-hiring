import { cn } from "@/lib/utils";

const SEGMENTS = [1, 2, 3, 4, 5];

function fill(score: number) {
  if (score >= 4) return "bg-foreground";
  if (score === 3) return "bg-foreground/55";
  return "bg-muted-foreground/45";
}

// A 1–5 score as digit + five segments. The digit and the bar length both carry the
// value, so colour is never the only signal.
export function ScoreBar({
  score,
  label,
  size = "compact",
}: {
  score: number;
  label: string;
  size?: "compact" | "wide";
}) {
  const wide = size === "wide";
  return (
    <span
      role="img"
      aria-label={`${label}: ${score} of 5`}
      className={cn("inline-flex flex-col gap-1", wide ? "w-full" : "items-center")}
    >
      <span className={cn("tabular-nums leading-none", wide ? "sr-only" : "text-sm")}>{score}</span>
      <span aria-hidden className={cn("flex gap-px", wide && "w-full")}>
        {SEGMENTS.map((segment) => (
          <span
            key={segment}
            style={{ animationDelay: `${segment * 45}ms` }}
            className={cn(
              segment <= score && "anim-bar",
              "rounded-[1px]",
              wide ? "h-2 flex-1" : "h-1 w-2",
              segment <= score ? fill(score) : "bg-muted",
            )}
          />
        ))}
      </span>
    </span>
  );
}
