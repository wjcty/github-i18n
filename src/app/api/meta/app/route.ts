import { NextResponse } from "next/server";
import { metaAppPayload } from "@/lib/github/app";

export async function GET() {
  return NextResponse.json(metaAppPayload());
}
