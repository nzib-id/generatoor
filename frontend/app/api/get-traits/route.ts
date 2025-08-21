import { NextResponse } from "next/server";
import { fetchTraits } from "@/lib/api";

export async function GET() {
  const data = await fetchTraits();
  return NextResponse.json(data);
}
