import { describe, expect, it } from "vitest";
import { describeResult } from "./noticeText";

/**
 * The second-person notice.
 *
 * `describeResult` takes `unknown` because what it renders comes back off a
 * route handler as JSON — the shape is whatever that endpoint decided to
 * return, and nothing between there and here checks it. So the tests feed it
 * the same untyped objects the wire does, and assert the exact sentence,
 * because the sentence is the whole product: the player pressed one button and
 * this is the only place the dice and their consequences are said out loud.
 */

describe("wymknięcie się (19.1)", () => {
  // 19.1 is answered, not rolled, so "no" changes nothing on the board. If the
  // notice were silent the button would look broken rather than refused.
  it("says an escape worked, and that the thing escaped is now out of reach", () => {
    expect(describeResult({ succeeded: true, onBridge: false })).toBe(
      "Wymknąłeś się (19.1) — nie możesz już nic zrobić temu, przed czym uciekłeś.",
    );
  });

  it("says a refusal is the character's, not the button's", () => {
    expect(describeResult({ succeeded: false, onBridge: true })).toBe(
      "Nie udało się wymknąć: twoja Postać nie potrafi tego na tym Obszarze (19.1).",
    );
  });

  it("needs both booleans before it claims this is an escape at all", () => {
    // `onBridge` alone is not an escape result — falling through to the later
    // branches is what lets some other shape carrying `succeeded` be read as
    // whatever it actually is.
    expect(describeResult({ succeeded: true })).toBeNull();
    expect(describeResult({ onBridge: true })).toBeNull();
  });
});

describe("a Zaklęcie being cast (9.6)", () => {
  it("names the Zaklęcie and reads out what it did", () => {
    expect(describeResult({ spell: "Krąg Płomieni", effect: "Wróg traci 1 Życia." })).toBe(
      "Rzucono Zaklęcie: Krąg Płomieni. Wróg traci 1 Życia.",
    );
  });

  it("still announces one whose effect the app cannot phrase", () => {
    // 9.6 reaches its victim anywhere on the board, so the announcement matters
    // even when there is nothing to say after it — and it must not trail a
    // space where the effect would have been.
    expect(describeResult({ spell: "Krąg Płomieni" })).toBe("Rzucono Zaklęcie: Krąg Płomieni.");
  });
});

describe("Pułapka (14.5)", () => {
  it("quotes the throw that was not enough to move you", () => {
    expect(describeResult({ kind: "pulapka", dice: [3, 4], outcome: "uniknieta" })).toBe(
      "Pułapka: 3 + 4 = 7 — mniej niż twoje punkty, zostajesz na miejscu.",
    );
  });

  it("looks the destination up on the board rather than printing the id", () => {
    // `to` arrives straight off the wire as a bare string. Printing it would
    // show the player "spadasz na osada", which is a field id, not a place.
    expect(
      describeResult({
        kind: "pulapka",
        dice: [5, 6],
        to: "osada",
        lost: ["Miecz", "Hełm"],
        kept: ["Zaklęcie"],
      }),
    ).toBe("Pułapka: 5 + 6 = 11 — spadasz na Osada. Tracisz: Miecz, Hełm. Zostaje przy tobie: Zaklęcie.");
  });

  it("falls back to the raw value for a field the board does not have", () => {
    expect(describeResult({ kind: "pulapka", dice: [5, 6], to: "nie-ma-takiego-pola" })).toBe(
      "Pułapka: 5 + 6 = 11 — spadasz na nie-ma-takiego-pola. Nic nie tracisz.",
    );
  });

  it("says where you landed even with no destination at all", () => {
    expect(describeResult({ kind: "pulapka", dice: [5, 6] })).toBe(
      "Pułapka: 5 + 6 = 11 — spadasz na ?. Nic nie tracisz.",
    );
  });

  it("says the loss was nothing rather than saying nothing", () => {
    // A fall costs two thirds of everything a character owns, so a fall that
    // cost nothing is news. Empty and absent read the same.
    const empty = describeResult({ kind: "pulapka", dice: [5, 6], to: "osada", lost: [], kept: [] });
    const absent = describeResult({ kind: "pulapka", dice: [5, 6], to: "osada" });
    expect(empty).toBe("Pułapka: 5 + 6 = 11 — spadasz na Osada. Nic nie tracisz.");
    expect(absent).toBe(empty);
  });

  it("omits the kept list when nothing was kept, and keeps it when something was", () => {
    expect(describeResult({ kind: "pulapka", dice: [4, 4], to: "osada", lost: ["Miecz"] })).toBe(
      "Pułapka: 4 + 4 = 8 — spadasz na Osada. Tracisz: Miecz.",
    );
    expect(describeResult({ kind: "pulapka", dice: [4, 4], to: "osada", kept: ["Miecz"] })).toBe(
      "Pułapka: 4 + 4 = 8 — spadasz na Osada. Nic nie tracisz. Zostaje przy tobie: Miecz.",
    );
  });
});

describe("Gra ze Śmiercią (14.6)", () => {
  // Four dice come back in one array: the first two are the character's and the
  // rest are Death's. Splitting them is the only way the player can check the
  // verdict against the throw.
  it("splits your two dice from Death's and says you won", () => {
    expect(describeResult({ kind: "gra-ze-smiercia", dice: [3, 4, 2, 2], outcome: "dalej" })).toBe(
      "Gra ze Śmiercią: ty 3 + 4 przeciw 2 + 2 — wygrywasz — idziesz dalej.",
    );
  });

  it("says a draw is played again next turn", () => {
    expect(describeResult({ kind: "gra-ze-smiercia", dice: [3, 4, 3, 4], outcome: "znowu" })).toBe(
      "Gra ze Śmiercią: ty 3 + 4 przeciw 3 + 4 — remis — grasz jeszcze raz w następnej turze.",
    );
  });

  it("treats every other outcome as the loss", () => {
    expect(describeResult({ kind: "gra-ze-smiercia", dice: [1, 1, 6, 6], outcome: "przegrana" })).toBe(
      "Gra ze Śmiercią: ty 1 + 1 przeciw 6 + 6 — przegrywasz — tracisz 1 Życia i grasz dalej.",
    );
  });
});

describe("the bridge's other two Obszary", () => {
  it("says what the Cerber took", () => {
    expect(describeResult({ kind: "cerber", dice: [4], lifeLost: 2 })).toBe(
      "Cerber: 4 — tracisz 2 Życia.",
    );
  });

  it("says the Strażnik's strength and that he is in the way until he dies", () => {
    expect(
      describeResult({
        kind: "straznik",
        outcome: "Strażnik Magicznych Wrót",
        dice: [2, 3],
        enemyTotal: 9,
      }),
    ).toBe("Strażnik Magicznych Wrót: 2 + 3 — jego siła to 9. Nie przejdziesz, póki nie zginie.");
  });
});

describe("a die table the app rolled and applied", () => {
  it("says the face and what the face did", () => {
    // The player pressed one button and saw neither half.
    expect(describeResult({ offer: "Karczma", face: 4, did: ["+1 Sztuka Złota"] })).toBe(
      "Karczma: wypadło 4 — +1 Sztuka Złota.",
    );
  });

  it("says outright that a face did nothing", () => {
    expect(describeResult({ offer: "Karczma", face: 2, did: [] })).toBe(
      "Karczma: wypadło 2 — nic się nie dzieje.",
    );
  });

  it("reads a card's script the same way as a field's offer", () => {
    expect(describeResult({ card: "Targowisko", did: ["kupujesz Miecz"] })).toBe(
      "Targowisko: kupujesz Miecz.",
    );
  });

  it("joins several things one face did", () => {
    expect(describeResult({ card: "Skarbiec", face: 6, did: ["+2 Sz. Z.", "+1 Zaklęcie"] })).toBe(
      "Skarbiec: wypadło 6 — +2 Sz. Z., +1 Zaklęcie.",
    );
  });

  it("hands an effect it cannot carry out back to the table", () => {
    // `stol` means the Karta is spent either way; what is left is the players'
    // to work out, and the notice must not read like it has been applied.
    expect(describeResult({ card: "Zwój", face: 2, did: ["coś dziwnego"], stol: true })).toBe(
      "Zwój: wypadło 2 — coś dziwnego — rozpatrzcie sami.",
    );
  });

  it("needs a face or a `did` before it claims a table was rolled", () => {
    expect(describeResult({ offer: "Karczma" })).toBeNull();
  });
});

describe("paying a healer (4.7)", () => {
  it("declines punkt for one and punkty for more", () => {
    // 4.7 caps healing at the four a character starts with, so this counter
    // never reaches the five that would want "punktów".
    expect(describeResult({ healed: 1, paid: 1 })).toBe("Wyleczone: 1 punkt Życia za 1 Sz. Z.");
    expect(describeResult({ healed: 3, paid: 3 })).toBe("Wyleczone: 3 punkty Życia za 3 Sz. Z.");
  });

  it("reports a purchase that healed nothing", () => {
    expect(describeResult({ healed: 0, paid: 0 })).toBe("Wyleczone: 0 punkty Życia za 0 Sz. Z.");
  });
});

describe("Trzęsawiska, the shape everything else falls through to", () => {
  it("sets the throw against Magia and says the crossing worked", () => {
    expect(describeResult({ dice: [4, 5], magia: 6, outcome: "udana" })).toBe(
      "Trzęsawiska: 4 + 5 = 9 przeciw Magii 6 — przeprawa udana.",
    );
  });

  it("treats every other outcome as the failure that costs a Życie", () => {
    expect(describeResult({ dice: [1, 2], magia: 6, outcome: "porazka" })).toBe(
      "Trzęsawiska: 1 + 2 = 3 przeciw Magii 6 — porażka — tracisz 1 Życie.",
    );
  });

  it("wants both the dice and the Magia before it says anything", () => {
    expect(describeResult({ dice: [1, 2] })).toBeNull();
    expect(describeResult({ magia: 6 })).toBeNull();
  });
});

describe("nothing to say", () => {
  // Returning null is how the caller knows to leave the notice area empty
  // rather than print an empty box, so the non-shapes matter as much as the
  // shapes.
  it("says nothing for null or undefined", () => {
    expect(describeResult(null)).toBeNull();
    expect(describeResult(undefined)).toBeNull();
  });

  it("says nothing for something that is not an object", () => {
    expect(describeResult("wymknąłeś się")).toBeNull();
    expect(describeResult(7)).toBeNull();
    expect(describeResult(true)).toBeNull();
  });

  it("says nothing for an object matching no branch", () => {
    expect(describeResult({})).toBeNull();
    expect(describeResult({ cokolwiek: "innego" })).toBeNull();
  });

  it("says nothing for a `kind` the bridge does not have", () => {
    // The switch falls through, and with no dice table and no Magia there is
    // nothing left to render — better silent than a half-built sentence.
    expect(describeResult({ kind: "smok", dice: [3] })).toBeNull();
  });
});
