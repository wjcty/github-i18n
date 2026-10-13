import { NextResponse } from "next/server";
import { LANGUAGES } from "@/lib/constants";

export async function GET() {
  return NextResponse.json({ languages: LANGUAGES });
}
