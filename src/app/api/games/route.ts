import { NextResponse } from "next/server";
import { createGame } from "@/lib/game/store";

export async function POST() {
  const { game, hostToken } = await createGame();
  return NextResponse.json({ joinCode: game.join_code, token: hostToken });
}
