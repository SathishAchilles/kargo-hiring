"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { correctDetails } from "@/app/actions/candidates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DetailsForm(props: { id: string; name: string; email: string; phone: string }) {
  const router = useRouter();
  const [name, setName] = useState(props.name);
  const [email, setEmail] = useState(props.email);
  const [phone, setPhone] = useState(props.phone);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const changed = name !== props.name || email !== props.email || phone !== props.phone;

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          await correctDetails(props.id, {
            name: name !== props.name ? name : undefined,
            email: email !== props.email ? email : undefined,
            phone: phone !== props.phone ? phone : undefined,
          });
          setMessage("Saved. The CV is re-redacted and re-read before any further AI use.");
          router.refresh();
        });
      }}
    >
      <h2 className="font-medium">Personal details (never sent to AI)</h2>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending || !changed}>
          {pending ? "Saving…" : "Correct details"}
        </Button>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>
    </form>
  );
}
