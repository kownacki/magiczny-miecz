import {assignKeys} from './utils/general.js';

export const ids = {
  GOOD: 0,
  EVIL: 1,
  CHAOTIC: 2,
};

export const list = assignKeys('id', Number, {
  [ids.GOOD]: {
    name: 'Dobry',
  },
  [ids.EVIL]: {
    name: 'Zły',
  },
  [ids.CHAOTIC]: {
    name: 'Chaotyczny',
  },
});
