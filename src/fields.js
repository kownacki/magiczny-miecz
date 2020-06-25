import {assignKeys} from './utils/general.js';
import {ids as eventsIds} from './events.js';
import ids from './fieldsIds.js';
import descriptions from './fieldsDescriptions.js';

export {ids};

export const list = _.flow(
  _.merge(_.mapValues((description) => ({description}), descriptions)),
  _.partial(assignKeys, ['id', Number]),
)({
  [ids.INN]: {
    adjacent: [ids.FROSTY_WASTELAND, ids.WILDERNESS],
    name: 'Karczma',
  },
  [ids.FROSTY_WASTELAND]: {
    adjacent: [ids.TOWN, ids.INN],
    name: 'Mroźne Pustkowie',
    event: eventsIds.DRAW_CARD_1,
  },
  [ids.TOWN]: {
    adjacent: [ids.ROADLESS_TRACK, ids.FROSTY_WASTELAND],
    name: 'Gród',
  },
  [ids.ROADLESS_TRACK]: {
    adjacent: [ids.WELL_OF_ETERNITY, ids.TOWN],
    name: 'Bezdroża',
    event: eventsIds.DRAW_CARD_2,
  },
  [ids.WELL_OF_ETERNITY]: {
    adjacent: [ids.CIRCLE_OF_POWER, ids.ROADLESS_TRACK],
    name: 'Studnia Wieczności',
  },
  [ids.CIRCLE_OF_POWER]: {
    adjacent: [ids.DEVILS_MILL, ids.WELL_OF_ETERNITY],
    name: 'Krąg Mocy',
  },
  [ids.DEVILS_MILL]: {
    adjacent: [ids.WETLANDS_1, ids.CIRCLE_OF_POWER],
    name: 'Czarci Młyn',
  },
  [ids.WETLANDS_1]: {
    adjacent: [ids.STEPPE_1, ids.DEVILS_MILL],
    name: 'Mokradła',
    event: eventsIds.DRAW_CARD_1,
  },
  [ids.STEPPE_1]: {
    adjacent: [ids.SETTLEMENT, ids.WETLANDS_1],
    name: 'Step',
    event: eventsIds.DRAW_CARD_1,
  },
  [ids.SETTLEMENT]: {
    adjacent: [ids.BARROW, ids.STEPPE_1],
    name: 'Osada',
  },
  [ids.BARROW]: {
    adjacent: [ids.WETLANDS_2, ids.SETTLEMENT],
    name: 'Kurhan',
  },
  [ids.WETLANDS_2]: {
    adjacent: [ids.STEPPE_2, ids.BARROW],
    name: 'Mokradła',
    event: eventsIds.DRAW_CARD_1,
  },
  [ids.STEPPE_2]: {
    adjacent: [ids.WILDERNESS, ids.WETLANDS_2],
    name: 'Step',
    event: eventsIds.DRAW_CARD_1,
  },
  [ids.WILDERNESS]: {
    adjacent: [ids.INN, ids.STEPPE_2],
    name: 'Uroczysko',
    event: eventsIds.DRAW_CARD_1,
  },
});

console.log(list);
