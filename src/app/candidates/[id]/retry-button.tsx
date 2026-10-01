"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { retryCandidate } from "@/app/actions/candidates";
import { Button } from "@/components/ui/button";

export function RetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await retryCandidate(id);
          router.refresh();
        })
      }
    >
      {pending ? "Retrying…" : "Retry"}
    </Button>
  );
}
