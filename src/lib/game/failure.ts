/** The difference between the rules refusing you and the machine breaking. */

/**
 * Something that did not work, as opposed to something that is not allowed.
 *
 * Almost everything thrown in this app is the rulebook speaking: "To nie twoja
 * tura", "Nie masz czym zapłacić przewoźnikowi", "Naturę można zmienić najwyżej
 * raz na turę (7.3)". Those are the game working — Polish sentences, quoting
 * numbered rules, addressed to a player. They belong next to the button that
 * was pressed, and calling them errors would tell somebody their game is broken
 * at the exact moment it is behaving correctly.
 *
 * This is the other kind: a write that was refused by the database, a row that
 * was not there, a constraint that fired. English, addressed to whoever is
 * building the thing, and never the player's fault. It has somewhere else to
 * go — the console, opened by itself.
 *
 * Marked here rather than sniffed downstream, and marked on the *failures*
 * rather than the refusals, because a refusal is the ordinary case: anything
 * thrown without saying otherwise is the rules talking.
 */
export class Failure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Failure";
  }
}

/** Whether an unknown thrown value is one of ours. */
export function isFailure(error: unknown): boolean {
  return error instanceof Failure || (error as Error)?.name === "Failure";
}
