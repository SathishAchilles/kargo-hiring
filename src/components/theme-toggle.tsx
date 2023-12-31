"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const ORDER = ["light", "dark", "system"] as const;
const LABEL = { light: "Light theme", dark: "Dark theme", system: "System theme" } as const;

// Cycles light → dark → system. Rendered after mount so the icon never mismatches the server HTML.
export function ThemeToggle() {
  const { theme = "system", setTheme } = useTheme();
  // false on the server and during hydration, true afterwards, so the icon never mismatches.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const current = (ORDER.includes(theme as (typeof ORDER)[number]) ? theme : "system") as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label={mounted ? `${LABEL[current]}. Switch to ${LABEL[next].toLowerCase()}` : "Change theme"}
      title={mounted ? LABEL[current] : "Theme"}
      onClick={() => setTheme(next)}
    >
      {mounted ? <Icon className="size-4" aria-hidden /> : <span className="size-4" />}
    </Button>
  );
}
