import { NextResponse } from "next/server";
import { createGame } from "@/lib/game/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  const { game, hostToken } = await createGame(name);
  return NextResponse.json({ joinCode: game.join_code, token: hostToken });
}
