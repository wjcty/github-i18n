import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export async function DELETE(request: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.confirm && body.confirm !== "DELETE") {
      return apiError(400, "VALIDATION_ERROR", "confirm must be DELETE");
    }
  } catch {
    /* optional body */
  }

  await prisma.user.delete({ where: { id: auth.user.id } });
  return new NextResponse(null, { status: 204 });
}
