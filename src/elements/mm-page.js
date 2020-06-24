import {LitElement, html, css} from 'lit-element';
import {unsafeHTML} from 'lit-html/directives/unsafe-html.js';
import dbSyncMixin from 'mkwc/dbSyncMixin.js';
import fb from '../utils/firebase.js';
import fields from '../fields.js';

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
      this._doRoll();
    }
    super.updated(changedProperties);
  }
  getData(path) {
    return fb.get(path);
  }
  _updateField(newField) {
    this._page = _.set('field', newField, this._page);
    return fb.update(this.path.extend('field'), newField);
  }
  _getDestination(position, steps, counter) {
    while (steps--) {
      position = fields[position].adjacent[counter ? 0 : 1];
    }
    return position;
  }
  _doRoll() {
    this._roll = _.random(1, 6);
    this._counterClockwiseMove = this._getDestination(this._page.field, this._roll, true);
    this._clockwiseMove = this._getDestination(this._page.field, this._roll, false);
  }
  _move(counter) {
    const destination = counter ? this._counterClockwiseMove : this._clockwiseMove;
    this._updateField(destination);
    this._doRoll();
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
        ${this._page.field} ${fields[this._page.field].name}
        <br>
        ${this._roll}
        <br>
        ${!this._counterClockwiseMove ? '' : html`
          <button @click=${() => this._move(true)}>${fields[this._counterClockwiseMove].name}</button>
          <br>
          ${unsafeHTML(_.replace(/\n/g, '<br>', fields[this._counterClockwiseMove].description))}
          <br>
          <button @click=${() => this._move(false)}>${fields[this._clockwiseMove].name}</button>
          <br>
          ${unsafeHTML(_.replace(/\n/g, '<br>', fields[this._clockwiseMove].description))}
          <br>
        `}
      `}
    `;
  }
}
customElements.define('mm-page', MmPage);
