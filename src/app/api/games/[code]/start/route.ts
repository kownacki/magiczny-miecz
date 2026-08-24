import { NextResponse } from "next/server";
import { findGame } from "@/lib/game/store";
import { startGame } from "@/lib/game/turnStore";

export async function POST(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });
  try {
    await startGame(game.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
