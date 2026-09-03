/** Every card effect, said in words, so the picture of the card is never the only place a rule lives. */

import type { Condition, Destination, Effect, Target } from "./cardScript";
import {
  cardName,
  characterName,
  fieldName,
  NATURE_LABEL,
  LOST_COUNTED,
  LOST_LABEL,
  plural,
  STAT_LABEL,
  TARGET_FULL,
  TARGET_SHORT,
  TARGET_SINGULAR,
} from "./polish";

/** Anyone but you is worth naming; "ty" is the default and saying it is noise. */
function forWhom(target: Target | undefined): string {
  return !target || target === "ty" ? "" : ` — ${TARGET_SHORT[target]}`;
}

/**
 * The same clause in the turn panel's voice.
 *
 * `polish.ts` keeps two wordings of the eleven targets on purpose: the short
 * one hangs off a summary that has already named itself, and the long one is
 * for a panel telling somebody to go and do a thing with no card in front of
 * them to read it against. Both of them then need the same rule about *when* to
 * say anything at all — never for "ty", never for a target that is absent — and
 * that rule was written out three times inside one component, once per case
 * that remembered it.
 *
 * The case that did not remember it was `strata`, which is the one that takes
 * cards away.
 */
export function andWhom(target: Target | undefined): string {
  return !target || target === "ty" ? "" : ` — ${TARGET_FULL[target]}`;
}

function where(destination: Destination): string {
  switch (destination.kind) {
    case "pole":
      return fieldName(destination.fieldId);
    case "dowolne-w-kregu":
      return "dowolny Obszar w Kręgu";
    case "poczatek-ruchu":
      return "tam, gdzie zaczynasz ruch";
    case "jedno-z":
      return destination.fieldIds.map(fieldName).join(" lub ");
  }
}

/**
 * The clause a conditional effect opens with.
 *
 * Exported because the buttons under a card have to say it too, and a second
 * copy of it had been living in the turn panel: three arms, the same words, and
 * nothing at all to notice if one of them changed.
 */
/** The same test, said the other way round — for a `gdy` that has both branches. */
export function describeConditionNot(condition: Condition): string {
  switch (condition.is) {
    case "natura":
      return `jeśli nie ${condition.jedna_z.map((n) => NATURE_LABEL[n] ?? n).join(" ani ")}`;
    case "prog":
      return `jeśli ${condition.stat === "sword" ? "Miecz" : "Magia"} ≥ ${condition.ponizej}`;
    case "attacker":
      return "jeśli nie zaatakowałeś innej Postaci w tej rozgrywce";
    case "ma-zloto":
      return "jeśli nie masz złota";
  }
}

export function describeCondition(condition: Condition): string {
  switch (condition.is) {
    case "natura":
      // `NATURE_LABEL` and not a lone `evil` ternary: this translated one of
              // the three and left "jeśli good" on a Polish table.
              return `jeśli ${condition.jedna_z.map((n) => NATURE_LABEL[n] ?? n).join(" lub ")}`;
    case "prog":
      return `jeśli ${condition.stat === "sword" ? "Miecz" : "Magia"} < ${condition.ponizej}`;
    case "attacker":
      return "jeśli zaatakowałeś inną Postać w tej rozgrywce";
    case "ma-zloto":
      return "jeśli masz złoto";
  }
}

/**
 * Groups a die table by outcome, so six faces read as the two or three things
 * that actually happen.
 *
 * "1, 2, 3 — przemykasz; 4 — Upiór (Magia 4)" is the card. Six separate lines
 * for six faces is the same information arranged so nobody reads it.
 */
function dieRows(faces: Record<number, Effect>): string[] {
  const order: { said: string; on: number[] }[] = [];
  for (const face of Object.keys(faces).map(Number).sort((a, b) => a - b)) {
    const said = describeEffect(faces[face]);
    const existing = order.find((entry) => entry.said === said);
    if (existing) existing.on.push(face);
    else order.push({ said, on: [face] });
  }
  return order.map((entry) => `${runs(entry.on)} — ${entry.said}`);
}

function dieTable(faces: Record<number, Effect>): string {
  return dieRows(faces).join("; ");
}

/**
 * A branching effect as rows, for a panel that has room to stack them.
 *
 * The same two shapes read very differently in a sentence and in a list: six
 * gifts or six faces run together with separators are a paragraph, and a
 * paragraph beside a picture is not read. `describeEffect` still joins them,
 * for the places that have one line — a journal entry, a console echo, a hover
 * on a tile. Null for everything else, which is most of the box: a card that
 * does one thing has one row and does not need this.
 */
export function effectRows(effect: Effect): string[] | null {
  if (effect.op === "wybor") {
    return ["do wyboru:", ...effect.options.map((option) => `— ${option.label}`)];
  }
  if (effect.op === "rzut") {
    return ["rzuć kostką:", ...dieRows(effect.faces)];
  }
  /**
   * A sequence flattens into the rows of its steps, but only if a step has any.
   *
   * The EREMITA is a die table and then a choice — „Rzuć kostką i umieść Kartę
   * Eremity na odpowiednim Obszarze: 1. Bezdroża… Pierwszej Postaci, Eremita
   * ofiaruje do wyboru: Magiczny Miecz lub Tarczę Tolimana" — and joined into
   * one line that is eight faces and two gifts in a paragraph. Split, it is the
   * card.
   *
   * A `po-kolei` of plain steps keeps the sentence: „tracisz 1 Życie, potem
   * przenosisz się" reads better as prose than as two bullets, and a rule that
   * turned every sequence into a list would make a list of everything.
   */
  /**
   * Both branches, each on its own row, and the second says its own condition.
   *
   * „Jeśli masz złoto: −1 Złota; w przeciwnym razie: +1 Złota" makes the reader
   * hold the first clause in their head to understand the second. „jeśli nie
   * masz złota" does not. Only where there are two branches: a `gdy` with one
   * is a sentence and reads like one.
   */
  /**
   * „w przeciwnym razie: nic się nie dzieje" is a row that says nothing.
   *
   * A condition with one branch already means the other way round nothing
   * happens — the Dobre Bóstwo judges you and, if it finds nothing, judges you
   * and goes. Spelling it out costs a line on a panel and tells the reader what
   * they had worked out from the shape of the first one.
   */
  if (effect.op === "gdy") {
    const branch = (said: string, taken: Effect) => {
      const rows = effectRows(taken);
      return rows ? [`${said}:`, ...rows] : [`${said}: ${describeEffect(taken)}`];
    };
    const taken = branch(describeCondition(effect.warunek), effect.to);
    if (!effect.inaczej || effect.inaczej.op === "nic") {
      // One branch, and it is only worth rows of its own if the branch has any
      // — otherwise it is a sentence and reads like one.
      return effectRows(effect.to) ? taken : null;
    }
    return [...taken, ...branch(describeConditionNot(effect.warunek), effect.inaczej)];
  }
  if (effect.op === "po-kolei") {
    const steps = effect.steps.map((step) => effectRows(step));
    if (!steps.some((rows) => rows !== null)) return null;
    /**
     * 15.1's placement and what the Karta then offers are two different
     * occasions, and the rows ran together as though both happened now.
     *
     * The EREMITA is the card: „Rzuć kostką i umieść Kartę Eremity na
     * odpowiednim Obszarze… Pierwszej Postaci, Eremita ofiaruje do wyboru:
     * Magiczny Miecz lub Tarczę Tolimana". The die is thrown by whoever draws
     * him and does nothing to them (15.1); the choice belongs to whoever stops
     * on the Obszar he lands on, which may be somebody else, several turns
     * later. Six placements and two gifts in one undifferentiated list read as
     * eight things happening to the reader.
     *
     * So each half says whose occasion it is, and the test is the placement
     * itself — the same string `goesToAField` looks for, asked of a step rather
     * than of a card id.
     */
    const out: string[] = [];
    let placed = false;
    effect.steps.forEach((step, at) => {
      const rows = [...(steps[at] ?? [describeEffect(step)])];
      if (JSON.stringify(step).includes('"poloz-karte"')) {
        rows[0] = `gdy wyciągnięta — ${rows[0]}`;
        placed = true;
      } else if (placed) {
        rows[0] = `gdy odwiedzony — ${rows[0]}`;
        // A blank row, which the panel draws as a gap: the placement happened
        // to whoever drew the Karta and this happens to whoever finds it, and
        // running the two groups together is the ambiguity the headings were
        // added to end.
        out.push("");
      }
      out.push(...rows);
    });
    return out;
  }
  return null;
}

/** "1, 2, 3" becomes "1-3"; scattered faces stay listed. */
function runs(faces: number[]): string {
  const parts: string[] = [];
  let start = faces[0];
  let last = faces[0];
  for (const face of faces.slice(1)) {
    if (face === last + 1) {
      last = face;
      continue;
    }
    parts.push(start === last ? `${start}` : `${start}-${last}`);
    start = face;
    last = face;
  }
  parts.push(start === last ? `${start}` : `${start}-${last}`);
  return parts.join(", ");
}

/**
 * What a `strata` takes off you, without saying who from.
 *
 * Split out because the same phrase is read in two registers: hanging off the
 * end of a card's summary, where `describeEffect` adds the target after it, and
 * alone under the buttons for one card, where the target has already been named
 * by the panel around it.
 */
export function describeLoss(effect: Extract<Effect, { op: "strata" }>): string {
  const how = effect.wybor === "losowo" ? " (losowo)" : "";
  const count = effect.count ?? 1;
  const many = count > 1 ? `${count} ` : "";
  const forms = LOST_COUNTED[effect.co];
  const what =
    count > 1 && forms ? plural(count, forms[0], forms[1], forms[2]) : LOST_LABEL[effect.co];
  return `tracisz ${many}${what}${how}`;
}

/**
 * One effect, in words.
 *
 * The point of it is that the scan stops being load-bearing. A card's picture is
 * the nicest way to read it and it will not always be there — a fresh checkout
 * has no scans at all — so every rule the app carries has to be sayable without
 * one. Recursive, because half the vocabulary is built out of other effects.
 *
 * Second person present throughout, and gender-neutral, for the same reason the
 * journal is: a player's name carries no gender and Polish past tense does.
 */
export function describeEffect(effect: Effect): string {
  switch (effect.op) {
    case "nic":
      return "nic się nie dzieje";

    case "po-kolei":
      return effect.steps.map(describeEffect).join("; ");

    /**
     * The labels alone.
     *
     * Every label in the box is already the outcome in the card's own words —
     * „1 punkt Miecza", „1 Zaklęcie", „przeniesienie w tym Kręgu" — because
     * they are written to go on the buttons a player presses. Pairing each with
     * a description of its effect gave „1 punkt Miecza: +1 Miecza / 1 punkt
     * Magii: +1 Magii / …": six clauses, each saying its own subject twice, run
     * together into a paragraph nobody reads.
     *
     * Middots and not „albo", which is the box's word for it: six of those in
     * one line is the same run-on by another route, and a list is what this is.
     */
    case "wybor":
      return `do wyboru: ${effect.options.map((option) => option.label).join(" · ")}`;

    case "rzut":
      return `rzuć kostką: ${dieTable(effect.faces)}`;

    case "gdy":
      return (
        `${describeCondition(effect.warunek)}: ${describeEffect(effect.to)}` +
        // See `effectRows`: an `inaczej` that does nothing is what a condition
        // with one branch already says.
        (effect.inaczej && effect.inaczej.op !== "nic"
          ? `; ${describeConditionNot(effect.warunek)}: ${describeEffect(effect.inaczej)}`
          : "")
      );

    case "punkty": {
      const many = Math.abs(effect.delta);
      return `${effect.delta > 0 ? "+" : "−"}${many} ${STAT_LABEL[effect.stat]}${forWhom(effect.target)}`;
    }

    case "uzdrow":
      return (
        `leczysz do ${effect.upTo} ${plural(effect.upTo, "Życia", "Życia", "Żyć")} (4.7)` +
        (effect.cena ? ` za ${effect.cena} Sz. Z.` : "")
      );

    case "sprzedaj":
      return `sprzedajesz Przedmiot za ${effect.cena} Sz. Z.`;

    case "tura-stracona": {
      const turns = `${effect.turns} ${plural(effect.turns, "turę", "tury", "tur")}`;
      const spared = effect.oprocz?.length
        ? ` (oprócz: ${effect.oprocz.map(characterName).join(", ")})`
        : "";
      /**
       * Who loses it, said as the subject rather than tacked on afterwards.
       *
       * „tracisz 1 turę — wszyscy" is second person about everybody: the reader
       * is told they lose a turn and then, in an aside, that so does the table.
       * The Zaklinacz Czasu does not single anybody out — „Wszystkie Postacie…
       * tracą 1 turę" — and neither does the Burza. Anything aimed at one
       * person keeps the direct address, which is right and shorter.
       */
      if (effect.target && effect.target !== "ty") {
        const verb = TARGET_SINGULAR.has(effect.target) ? "traci" : "tracą";
        return `${TARGET_SHORT[effect.target]} ${verb} ${turns}${spared}`;
      }
      return `tracisz ${turns}${spared}`;
    }

    case "ruch-dodatkowy":
      return "dodatkowy ruch";

    // The label is the card's own words for it, so it is trusted rather than
    // rebuilt out of the modifier — "Opętany" says more than "ruch: 0 pól".
    case "efekt":
      return effect.label;

    case "rzut-za-kazdego":
      return (
        `rzut za każdego z ${effect.co === "przyjaciel" ? "Przyjaciół" : "Przedmiotów"} — ` +
        `${effect.gubiPrzy} lub mniej i przepada`
      );

    case "uwolnij":
      return `uwalniasz się od: ${cardName(effect.od)}`;

    case "zabierz": {
      const what =
        effect.co === "przedmiot-lub-zloto"
          ? "1 Przedmiot lub 1 Sztukę Złota"
          : effect.co === "przyjaciel"
            ? "1 Przyjaciela"
            : effect.co === "zaklecie"
              ? "1 Zaklęcie"
              : "1 Przedmiot";
      const who = effect.wybiera === "rzucajacy" ? " (ty wybierasz)" : "";
      return `zabierasz ofierze ${what}${who}`;
    }

    case "zaklecie": {
      const many = `${effect.count} ${plural(effect.count, "Zaklęcie", "Zaklęcia", "Zaklęć")}`;
      // The Sztukmistrz sells; everybody else gives. A price left unsaid is the
      // one thing a player would want to have known first.
      if (effect.cena) {
        return `kupujesz ${many} za ${plural(effect.cena * effect.count, "Sztukę Złota", "Sztuki Złota", "Sztuk Złota")}`;
      }
      // „Możesz je wybrać ze stosu" — the Półbóg's, and the reason to meet him.
      // „dowolne", because the point is that no face of the pile is off limits.
      return effect.zeStosu
        ? `wybierasz ${effect.count} dowolne ${plural(effect.count, "Zaklęcie", "Zaklęcia", "Zaklęć")} ze stosu`
        : `bierzesz ${many}`;
    }

    case "zaklecia-do-limitu":
      return "dobierasz Zaklęcia do swojego limitu (2.6)";

    case "przenies":
      return `przenosisz się: ${where(effect.to)}`;

    case "wyciagnij":
      return `ciągniesz ${effect.count} ${plural(effect.count, "Kartę", "Karty", "Kart")}`;

    case "walka": {
      const strength =
        effect.miecz !== undefined
          ? `Miecz ${effect.miecz}`
          : effect.magia !== undefined
            ? `Magia ${effect.magia}`
            : "";
      return `walka: ${effect.nazwa}${strength ? ` (${strength})` : ""}`;
    }

    // Whom he is sent at is the caster's to name, so the sentence stops at what
    // is being sent — the target is said by the journal line that reports it.
    case "przyzwij":
      return `${effect.nazwa} (Miecz ${effect.miecz}) atakuje wskazaną Postać lub Wroga`;

    case "podejrzyj":
      return `zaglądasz na ${effect.count} pierwszych Kart stosu`;

    case "przenies-karte":
      return "przenosisz odkrytą Kartę na inny Obszar w tym Kręgu";

    case "wymien-karte":
      return "odrzucasz wyciągniętą Kartę i ciągniesz inną";

    case "strata":
      return `${describeLoss(effect)}${forWhom(effect.target)}`;

    case "kamien":
      return "zamiana w Kamień na 3 tury (20.1)";

    case "zamien-punkty":
      return "zamieniasz punkty Miecza i Magii";

    /**
     * The Mędrzec's riddle, said in full because every word of it is a rule.
     *
     * „Wybierz cyfrę od 1 do 6 (musisz ją głośno powiedzieć), a następnie rzuć
     * kostką. Jeżeli wynikiem jest cyfra, którą wybrałeś, otrzymujesz 1
     * Zaklęcie." „Zgadujesz" left out all three of the things a player needs:
     * that it is a number from one to six, that it is named *before* the die,
     * and that saying it aloud is the card's own condition — the whole of the
     * riddle is that the table hears the guess first.
     */
    case "zgadnij":
      return (
        "wybierasz cyfrę od 1 do 6 i mówisz ją głośno, potem rzuć kostką — " +
        `jeśli wypadnie twoja: ${describeEffect(effect.nagroda)}`
      );

    case "natura":
      return `Natura: ${effect.na === "evil" ? "zła" : effect.na}`;

    case "kup":
      return `kupujesz — ${effect.towar
        .map((item) => `${item.co} za ${item.cena} Sz. Z.`)
        .join(", ")}`;

    case "jak-pole":
      return `dzieje się to, co na Obszarze: ${fieldName(effect.fieldId)}`;

    case "poloz-karte":
      return `kładziesz Kartę: ${where(effect.gdzie)}`;

    case "otrzymaj":
      return `otrzymujesz: ${effect.co}`;
  }
}

/**
 * The same effect, in as few words as a table row can hold.
 *
 * The second voice in this file, and deliberately a second wording rather than
 * a second copy — the arrangement `TARGET_SHORT` and `TARGET_FULL` are already
 * in, for the reason `polish.ts` sets out: two exhaustive tables of one union
 * written in two files are two lists the compiler keeps complete and nothing
 * keeps equal. So they live together.
 *
 * What earns the second voice is the shape it is read in: a field's own table,
 * six faces down the side of a sheet, where the die's number is already the
 * left-hand column. `describeEffect` writes the card out; this writes the row.
 * The `wybor` case is where the difference is plainest — an option labelled
 * "+1 Miecza" whose effect reads "+1 Miecza" is one thing said twice, so the
 * summary trusts the labels and prints "A albo B".
 *
 * Not exhaustive, and that is the known hole: every op without a terse form
 * falls through to "rozpatrzcie sami", which is honest but is the app giving
 * up. Nothing a compulsory field offers reaches it today (16.5 makes that the
 * Karczma and the Strażnik, and both are covered). `effectText.test.ts` walks
 * every op in the union so that the day one more lands here it lands visibly.
 */
export function summariseEffect(effect: Effect): string {
  switch (effect.op) {
    case "nic":
      return "nic się nie dzieje";

    case "punkty":
      return `${effect.delta > 0 ? "+" : "−"}${Math.abs(effect.delta)} ${STAT_LABEL[effect.stat]}`;

    case "tura-stracona":
      return `tracisz ${effect.turns} ${plural(effect.turns, "turę", "tury", "tur")}`;

    case "walka":
      return `walka: ${effect.nazwa} (${
        effect.magia !== undefined ? `Magia ${effect.magia}` : `Miecz ${effect.miecz}`
      })`;

    case "przyzwij":
      return `${effect.nazwa} (Miecz ${effect.miecz}) atakuje`;

    case "podejrzyj":
      return `zaglądasz na ${effect.count} Kart`;

    case "przenies-karte":
      return "przenosisz Kartę na inny Obszar";

    case "wymien-karte":
      return "wymiana wyciągniętej Karty";

    case "przenies":
      return effect.to.kind === "pole"
        ? `przenieś się na: ${fieldName(effect.to.fieldId)}`
        : "przenieś się na dowolny Obszar w tym Kręgu";

    case "zaklecie":
      return effect.zeStosu
        ? `${effect.count} dowolne Zaklęcie ze stosu`
        : `+${effect.count} Zaklęcie`;

    case "kamien":
      return "Zamiana w Kamień (20.1)";

    case "uzdrow":
      return effect.cena ? `leczenie za ${effect.cena} Sz. Z. za punkt` : "uzdrowienie";

    case "wybor":
      return effect.options.map((option) => option.label).join(" albo ");

    case "po-kolei":
      return effect.steps.map(summariseEffect).join(", potem ");

    case "gdy":
      // The condition said out loud. It used to be dropped, which left a row
      // reading "+1 Zaklęcie, inaczej nic się nie dzieje" with no way to tell
      // which half applied — a rule the table is told wrong, not a rule said
      // briefly.
      return (
        `${describeCondition(effect.warunek)}: ${summariseEffect(effect.to)}` +
        (effect.inaczej ? `, inaczej ${summariseEffect(effect.inaczej)}` : "")
      );

    /**
     * The Wieża Przeznaczenia rolls it on two of its six faces, and 16.5 makes
     * that a table nobody may walk past — so the app has to be able to say what
     * happened rather than hand the row back. This is the hole the comment
     * above predicted, found by the test that was written to find it.
     */
    case "ruch-dodatkowy":
      return "dodatkowy ruch";
    case "efekt":
      return effect.label;
    case "rzut-za-kazdego":
      return effect.co === "przyjaciel" ? "rzut za każdego Przyjaciela" : "rzut za każdy Przedmiot";
    case "uwolnij":
      return `uwolnienie od: ${cardName(effect.od)}`;
    case "zabierz":
      return "zabierasz ofierze Kartę";

    default:
      return "rozpatrzcie sami";
  }
}
