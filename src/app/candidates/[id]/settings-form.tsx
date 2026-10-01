"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateSettings } from "@/app/actions/candidates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsForm({ id, appliedRole, asOfDate }: { id: string; appliedRole: string; asOfDate: string }) {
  const router = useRouter();
  const [role, setRole] = useState(appliedRole);
  const [date, setDate] = useState(asOfDate);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          try {
            await updateSettings(id, { appliedRole: role, asOfDate: date });
            setMessage("Saved and rescored.");
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not save.");
          }
        });
      }}
    >
      <h2 className="font-medium">Application</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="applied">Applied role</Label>
          <select
            id="applied"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="pm">PM</option>
            <option value="spm">Senior PM</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="asof">As-of date</Label>
          <Input id="asof" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Roles ending “Present” run to this date. Changing it rescores instantly, with no AI call.</p>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>
    </form>
  );
}
