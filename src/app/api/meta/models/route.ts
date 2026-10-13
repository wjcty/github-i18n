import { NextResponse } from "next/server";
import { DEFAULT_MODEL_ID } from "@/lib/constants";
import { fetchOpenRouterModels } from "@/lib/openrouter";

export async function GET() {
  const models = await fetchOpenRouterModels();
  return NextResponse.json({
    models,
    defaultModelId: DEFAULT_MODEL_ID,
  });
}
