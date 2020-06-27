import {LitElement, html, css} from 'lit-element';
import {unsafeHTML} from 'lit-html/directives/unsafe-html.js';
import dbSyncMixin from 'mkwc/dbSyncMixin.js';
import fb from '../utils/firebase.js';
import {Field} from '../fields.js';
import {list as naturesList} from '../natures.js';
import {d6 as rollD6} from '../utils/roll.js';
import {Player} from '../player.js';

export default class MmPage extends dbSyncMixin('_data', LitElement) {
  static get properties() {
    return {
      uid: String,
      _data: Object,
      _player: Player,
      _roll: Number,
      _counterClockwiseMove: Field,
      _clockwiseMove: Field,
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
      this._player = new Player(this._data);
      this._doMoveRoll();
    }
    super.updated(changedProperties);
  }
  getData(path) {
    return fb.get(path);
  }
  _updateField(newField) {
    this._player.updateField(newField);
    this.requestUpdate();
    return fb.update(this.path.extend('field'), newField);
  }
  _getDestination(position, steps, counter) {
    while (steps--) {
      position = position.adjacent[counter ? 0 : 1];
    }
    return position;
  }
  _doMoveRoll() {
    this._roll = rollD6('move');
    this._counterClockwiseMove = this._getDestination(this._player.field, this._roll, true);
    this._clockwiseMove = this._getDestination(this._player.field, this._roll, false);
  }
  _modifyAttr(attr, byAmount) {
    const newAmount = this._player.increaseAttr(attr, byAmount);
    this.requestUpdate();
    return fb.update(this.path.extend(`attr.${attr}`), newAmount);
  }
  _move(counter) {
    const newField = counter ? this._counterClockwiseMove : this._clockwiseMove;
    this._player.move(newField);
    this.requestUpdate();
    this._doMoveRoll();
    return fb.update(this.path.extend('field'), newField.id);
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
      ${!this._player ? '' : html`
        Jesteś w: ${this._player.field.name} (${this._player.field.id})
        <br>
        Natura: ${naturesList[this._player.nature].name}
        <br>
        Złoto: ${this._player.attr.gold}
        <br>
        Życia: ${this._player.attr.lifes}
        <br>
        Sword: ${this._player.attr.sword}
        <br>
        Magic: ${this._player.attr.magic}
        <br>
        Rzut na ruch: ${this._roll}
        <br>
        ${!this._counterClockwiseMove ? '' : html`
          <button @click=${() => this._move(true)}>${this._counterClockwiseMove.name}</button>
          <br>
          ${unsafeHTML(_.replace(/\n/g, '<br>', this._counterClockwiseMove.description))}
          <br>
          <button @click=${() => this._move(false)}>${this._clockwiseMove.name}</button>
          <br>
          ${unsafeHTML(_.replace(/\n/g, '<br>', this._clockwiseMove.description))}
          <br>
        `}
      `}
    `;
  }
}
customElements.define('mm-page', MmPage);
