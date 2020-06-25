import {mapValuesAndKeys} from 'mk-utils/general.js';

export const eventTypes = {
  CARD_1: 1,
  CARD_2: 2,
};

export const natureTypes = {
  GOOD: 0,
  EVIL: 1,
  CHAOTIC: 2,
};


export const fieldIds = {
  INN: 1,
  FROSTY_WASTELAND: 2,
  TOWN: 3,
  ROADLESS_TRACK: 4,
  WELL_OF_ETERNITY: 5,
  CIRCLE_OF_POWER: 6,
  DEVILS_MILL: 7,
  WETLANDS_1: 8,
  STEPPE_1: 9,
  SETTLEMENT: 10,
  BARROW: 11,
  WETLANDS_2: 12,
  STEPPE_2: 13,
  WILDERNESS: 14,
};

export const list = mapValuesAndKeys(_, (val, id) => [{id: Number(id), ...val}, id], {
  [fieldIds.INN]: {
    adjacent: [fieldIds.FROSTY_WASTELAND, fieldIds.WILDERNESS],
    name: 'Karczma',
  },
  [fieldIds.FROSTY_WASTELAND]: {
    adjacent: [fieldIds.TOWN, fieldIds.INN],
    name: 'Mroźne Pustkowie',
    event: eventTypes.CARD_1,
  },
  [fieldIds.TOWN]: {
    adjacent: [fieldIds.ROADLESS_TRACK, fieldIds.FROSTY_WASTELAND],
    name: 'Gród',
  },
  [fieldIds.ROADLESS_TRACK]: {
    adjacent: [fieldIds.WELL_OF_ETERNITY, fieldIds.TOWN],
    name: 'Bezdroża',
    event: eventTypes.CARD_2,
  },
  [fieldIds.WELL_OF_ETERNITY]: {
    adjacent: [fieldIds.CIRCLE_OF_POWER, fieldIds.ROADLESS_TRACK],
    name: 'Studnia Wieczności',
  },
  [fieldIds.CIRCLE_OF_POWER]: {
    adjacent: [fieldIds.DEVILS_MILL, fieldIds.WELL_OF_ETERNITY],
    name: 'Krąg Mocy',
  },
  [fieldIds.DEVILS_MILL]: {
    adjacent: [fieldIds.WETLANDS_1, fieldIds.CIRCLE_OF_POWER],
    name: 'Czarci Młyn',
  },
  [fieldIds.WETLANDS_1]: {
    adjacent: [fieldIds.STEPPE_1, fieldIds.DEVILS_MILL],
    name: 'Mokradła',
    event: eventTypes.CARD_1,
  },
  [fieldIds.STEPPE_1]: {
    adjacent: [fieldIds.SETTLEMENT, fieldIds.WETLANDS_1],
    name: 'Step',
    event: eventTypes.CARD_1,
  },
  [fieldIds.SETTLEMENT]: {
    adjacent: [fieldIds.BARROW, fieldIds.STEPPE_1],
    name: 'Osada',
  },
  [fieldIds.BARROW]: {
    adjacent: [fieldIds.WETLANDS_2, fieldIds.SETTLEMENT],
    name: 'Kurhan',
  },
  [fieldIds.WETLANDS_2]: {
    adjacent: [fieldIds.STEPPE_2, fieldIds.BARROW],
    name: 'Mokradła',
    event: eventTypes.CARD_1,
  },
  [fieldIds.STEPPE_2]: {
    adjacent: [fieldIds.WILDERNESS, fieldIds.WETLANDS_2],
    name: 'Step',
    event: eventTypes.CARD_1,
  },
  [fieldIds.WILDERNESS]: {
    adjacent: [fieldIds.INN, fieldIds.STEPPE_2],
    name: 'Uroczysko',
    event: eventTypes.CARD_1,
  },
});

const descriptions = {
  1: `MUSISZ RZUCIĆ KOSTKĄ:
1 - przegrałeś w kości 1 Sz. Z;
2 - wygrałeś 1 Sz. Z;
3 - musisz tu nocować, tracisz 1 turę;
4 - musisz stawić czoła miejscowemu osiłkowi (Miecz 4);
5 - poczęstowano cię eliksirem, dzięki któremu możesz przenieść się do dowolnego miejsca w tym Kręgu;
6 - eliksir, który ci podano może przenieść cię do Świątyni Nemed.`,
  2: `WYCIĄGNIJ 1 KARTĘ.
Nie ciągnij Karty jeśli jakaś już tu jest.`,
  3: `MOŻESZ TU ODWIEDZIĆ:
<strong>Wróżbitę</strong>: rzuć kostką
1 - zyskujesz 1 Zaklęcie;
2 - zostajesz Zaklęty w Kamień;
3 - jeżeli jesteś Zły stajesz się Dobry. Jeżeli jesteś Chaotyczny stajesz się Zły;
4-6 zostałeś zignorowany.
<strong>Lichwiarza</strong> - możesz wymienić dowolne Przedmioty na złoto (odłóż ich Karty i weź po 1 Sz. Z za każdy).`,
};
