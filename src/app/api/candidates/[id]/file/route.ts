import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { candidates, cvFiles } from "@/db/schema";
import { requireFounder, UnauthorizedError } from "@/lib/auth/guard";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireFounder();
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    throw error;
  }
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await db
    .select({ bytes: cvFiles.bytes, mime: candidates.fileMime, name: candidates.fileName })
    .from(cvFiles)
    .innerJoin(candidates, eq(candidates.id, cvFiles.candidateId))
    .where(eq(cvFiles.candidateId, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(row.bytes), {
    headers: {
      "Content-Type": row.mime,
      "Content-Disposition": `inline; filename="${row.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
