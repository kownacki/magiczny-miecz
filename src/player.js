import {ids as fieldIds, list as fieldsList} from './fields.js';
import {getRandomMeetingCard, executeCard} from './eventsCards.js';
import {d6 as rollD6} from './utils/roll.js';
import {ids as naturesIds} from './natures.js';
import {ids as eventsIds} from './events.js';

const nothingHappens = () => {
  console.log(`Nic się nie dzieje`);
};
const loseTurns = (count) => {
  console.log(`Tracisz ${count} rund${count === 1 ? 'ę' : ''}`);
};

export class Player {
  constructor(data, path) {
    this.attr = data.attr;
    this.field = fieldsList[data.field];
    this.nature = data.nature;
  }
  increaseAttr(attr, byAmount) { // gold / lifes / sword / magic
    const oldAmount = this.attr[attr];
    const newAmount = Math.max(0, oldAmount + byAmount);
    this.attr[attr] = newAmount;
    console.log(`Changing ${attr} from ${oldAmount} to ${newAmount}`);
    return newAmount;
  }
  // Changes field without visiting
  updateField(newField) {
    const oldField = this.field;
    this.field = newField;
    console.log(`Moving from ${oldField.id} (${oldField.name}) to ${newField.id} (${newField.name})`);
  }
  visitField(field) {
    console.log(`Visiting ${field.name}`);
    if (field.id === fieldIds.INN) {
      const innRoll = rollD6(field.name);
      if (innRoll === 1) {
        this.increaseAttr('gold', -1);
      }
      else if (innRoll === 2) {
        this.increaseAttr('gold', 1);
      }
    }
    if (field.id === fieldIds.DEVILS_MILL) {
      if (this.nature === naturesIds.GOOD) {
        this.increaseAttr('lifes', -1);
      }
      else if (this.nature === naturesIds.CHAOTIC) {
        const devilsMillRollChaotic = rollD6(field.name);
        this.increaseAttr('lifes', devilsMillRollChaotic <= 3 ? 1 : -1)
      }
      else { // this.nature === natureTypes.EVIL
        const devilsMillRollEvil = rollD6(field.name);
        console.log('choice (unimplemented)')
        // todo implement choice
      }
    }
    if (field.id === fieldIds.BARROW) {
      const barrowRoll = rollD6(field.name);
      if (barrowRoll === 1) {
        this.increaseAttr('sword', 1);
      }
      else if (barrowRoll === 2 || barrowRoll === 3) {
        nothingHappens();
      }
      else if (barrowRoll === 4 || barrowRoll === 5) {
        loseTurns(1);
      }
      else { // barrowRoll === 6
        console.log('fight (unimplemented)')
        // todo implement fight
      }
    }
    if (field.event === eventsIds.DRAW_CARD_1) {
      const card = getRandomMeetingCard();
      executeCard(card, this);
    }
    if (field.event === eventsIds.DRAW_CARD_2) {
      console.log(`Karta zdarzenia x2`);
    }
  }
  // Changes field with visiting
  move(newField) {
    this.updateField(newField);
    this.visitField(newField);
  }
}
