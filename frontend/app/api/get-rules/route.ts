import { NextResponse } from "next/server";
import { fetchRules } from "@/lib/api";

export async function GET() {
  const data = await fetchRules();
  return NextResponse.json(data);
}
