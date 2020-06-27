import {assignKeys} from './utils/general.js';
import {ids as naturesIds} from './natures.js';
import {d6 as rollD6} from './utils/roll.js';

class RollEvent {
  constructor(data) {
    Object.assign(this, data);
  }
}

export const events = {
  DRAW_CARD_1: 1,
  DRAW_CARD_2: 2,
  LOSE_TURN_1: 3,
  MODIFY_ATTR: 4,
};

export const players = {
  CURRENT: 0,
  ALL: 1,
};

export const conditions = {
  CURRENT_PLAYER: 1,
  nature: (id) => ({}),
};

const temp = (player, conditions) => {
  // return _.every((condition) => {
  //   if ()
  // }, conditions);
};

const executeEvent = (event, name, player) => {
  if (event instanceof RollEvent) {
    const roll = rollD6(name);
    executeEvents(event.results[roll], name, player);
  } else if (typeof event !== 'function') {
    if (!event.condition || event.condition(player)) {
      executeEvents(event.events, name, player);
    }
  } else { // function
    event(player);
  }
};

const executeEvents = (events, name, player) => {
  _.forEach((event) => executeEvent(event, name, player), events);
};

export const executeCard = (card, player) => {
  executeEvents(card.events, card.name, player);
};

export const getRandomMeetingCard = () => {
  const meetingsIds = _.keys(meetings);
  return meetings[2];//meetings[meetingsIds[_.random(0, meetingsIds.length-1)]];
};

export const meetings = _.flow(
  _.mapValues(_.set('type', 'meeting')),
  _.partial(assignKeys, ['id', Number]),
)({
  1: {
    name: 'BURZA SIEDMIU SŁOŃC',
    events: events.LOSE_TURN_1,
  },
  2: {
    name: 'DANINA',
    events: [{
      //condition: (player) => player === players.CURRENT,
      events: [new RollEvent({
        results: {
          1: [{
            condition: (player) => player.nature === naturesIds.GOOD,
            events: [(player) => player.increaseAttr('gold', -1)],
          }],
          2: [{
            condition: (player) => player.nature === naturesIds.CHAOTIC,
            events: [(player) => player.increaseAttr('gold', -1)],
          }],
          3: [{
            condition: (player) => player.nature === naturesIds.EVIL,
            events: [(player) => player.increaseAttr('gold', -1)],
          }],
          4: [{
            players: players.ALL,
            condition: (player) => true, // todo implement other circles
          }],
          5: [{
            players: players.ALL,
            condition: (player) => false, // todo implement other circles
          }],
          6: [{
            players: players.ALL,
            condition: (player) => false, // todo implement other circles
          }],
        },
      })],
    }],
  },
  3: {
    name: 'GODZINA DUCHÓW',
  },
  4: {
    name: 'KOMETA',
  },
  5: {
    name: 'MAGICZNA TABLICA',
  },
  6: {
    name: 'MGŁA',
  },
  7: {
    name: 'POŁUDNICA',
  },
  8: {
    name: 'POSŁAŃCY BOGÓW',
  },
  9: {
    name: 'PRZESILENIE',
  },
  10: {
    name: 'SABAT CZAROWNIC',
  },
  11: {
    name: 'SŁUP OGNIA',
  },
  12: {
    name: 'STRAŻ',
  },
  13: {
    name: 'TURNIEJ RYCERSKI',
  },
  14: {
    name: 'UKŁAD PLANET',
  },
  15: {
    name: 'ZAĆMIENIE SŁOŃC',
  },
  16: {
    name: 'ZAKLĘTA ŚCIEŻKA',
  },
  17: {
    name: 'ZARAZA',
  },
  18: {
    name: 'ZASADZKA',
  },
  19: {
    name: 'ZATRUTE ZIOŁA',
  },
  20: {
    name: 'ZŁY DUCH',
  },
});
