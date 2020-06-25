import {LitElement, html, css} from 'lit-element';
import {unsafeHTML} from 'lit-html/directives/unsafe-html.js';
import dbSyncMixin from 'mkwc/dbSyncMixin.js';
import fb from '../utils/firebase.js';
import {ids as fieldIds, list as fieldsList} from '../fields.js';
import {ids as eventsIds} from '../events.js';
import {ids as naturesIds, list as naturesList} from '../natures.js';
import {d6 as rollD6} from '../utils/roll.js';

export default class MmPage extends dbSyncMixin('_page', LitElement) {
  static get properties() {
    return {
      uid: String,
      _page: Object,
      _roll: Number,
      _counterClockwiseMove: Number,
      _clockwiseMove: Number,
    };
  }
  constructor() {
    super();
    (async () => {
      await this.updateComplete;
      this.path = fb.path(`pages/${this.uid}`);
    })();
  }
  updated(changedProperties) {
    if (changedProperties.has('ready') && this.ready) {
      this._doMoveRoll();
    }
    super.updated(changedProperties);
  }
  getData(path) {
    return fb.get(path);
  }
  _nothingHappens() {
    console.log(`Nic się nie dzieje`);
  }
  _loseTurns(count) {
    console.log(`Tracisz ${count} rund${count === 1 ? 'ę' : ''}`);
  }
  _updateField(newField) {
    this._page = _.set('field', newField, this._page);
    return fb.update(this.path.extend('field'), newField);
  }
  _getDestination(position, steps, counter) {
    while (steps--) {
      position = fieldsList[position].adjacent[counter ? 0 : 1];
    }
    return position;
  }
  _doMoveRoll() {
    this._roll = rollD6('move');
    this._counterClockwiseMove = this._getDestination(this._page.field, this._roll, true);
    this._clockwiseMove = this._getDestination(this._page.field, this._roll, false);
  }
  _modifyAttr(byAmount, attr) { // gold / lifes / sword / magic
    const oldAmount = this._page.attr[attr];
    const newAmount = Math.max(0, oldAmount + byAmount);
    this._page = _.set(`attr.${attr}`, newAmount, this._page);
    console.log(`Changing ${attr} from ${oldAmount} to ${newAmount}`);
    return fb.update(this.path.extend(`attr.${attr}`), newAmount);
  }
  _visitField(field) {
    console.log(`Visiting ${field.name}`);
    if (field.id === fieldIds.INN) {
      const innRoll = rollD6(field.name);
      if (innRoll === 1) {
        this._modifyAttr(-1, 'gold');
      }
      else if (innRoll === 2) {
        this._modifyAttr(1, 'gold');
      }
    }
    if (field.id === fieldIds.DEVILS_MILL) {
      if (this._page.nature === naturesIds.GOOD) {
        this._modifyAttr(-1, 'lifes');
      }
      else if (this._page.nature === naturesIds.CHAOTIC) {
        const devilsMillRollChaotic = rollD6(field.name);
        this._modifyAttr(devilsMillRollChaotic <= 3 ? 1 : -1, 'lifes')
      }
      else { // this._page.nature === natureTypes.EVIL
        const devilsMillRollEvil = rollD6(field.name);
        console.log('choice (unimplemented)')
        // todo implement choice
      }
    }
    if (field.id === fieldIds.BARROW) {
      const barrowRoll = rollD6(field.name);
      if (barrowRoll === 1) {
        this._modifyAttr(1, 'sword');
      }
      else if (barrowRoll === 2 || barrowRoll === 3) {
        this._nothingHappens();
      }
      else if (barrowRoll === 4 || barrowRoll === 5) {
        this._loseTurns(1);
      }
      else { // barrowRoll === 6
        console.log('fight (unimplemented)')
        // todo implement fight
      }
    }
    if (field.event === eventsIds.DRAW_CARD_1) {
      console.log(`Karta zdarzenia x1`);
    }
    if (field.event === eventsIds.DRAW_CARD_2) {
      console.log(`Karta zdarzenia x2`);
    }
  }
  _move(counter) {
    const destination = counter ? this._counterClockwiseMove : this._clockwiseMove;
    console.log(`Moving from ${this._page.field} (${fieldsList[this._page.field].name}) to ${destination} (${fieldsList[destination].name})`);
    this._updateField(destination);
    this._visitField(fieldsList[destination]);
    this._doMoveRoll();
  }
  static get styles() {
    return css`
      :host {
        display: block;
      }
    `;
  }
  render() {
    return html`
      ${!this.ready ? '' : html`
        Jesteś w: ${fieldsList[this._page.field].name} (${this._page.field})
        <br>
        Natura: ${naturesList[this._page.nature].name}
        <br>
        Złoto: ${this._page.attr.gold}
        <br>
        Życia: ${this._page.attr.lifes}
        <br>
        Sword: ${this._page.attr.sword}
        <br>
        Magic: ${this._page.attr.magic}
        <br>
        Rzut na ruch: ${this._roll}
        <br>
        ${!this._counterClockwiseMove ? '' : html`
          <button @click=${() => this._move(true)}>${fieldsList[this._counterClockwiseMove].name}</button>
          <br>
          ${unsafeHTML(_.replace(/\n/g, '<br>', fieldsList[this._counterClockwiseMove].description))}
          <br>
          <button @click=${() => this._move(false)}>${fieldsList[this._clockwiseMove].name}</button>
          <br>
          ${unsafeHTML(_.replace(/\n/g, '<br>', fieldsList[this._clockwiseMove].description))}
          <br>
        `}
      `}
    `;
  }
}
customElements.define('mm-page', MmPage);
