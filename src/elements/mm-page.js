import {LitElement, html, css} from 'lit-element';
import dbSyncMixin from 'mkwc/dbSyncMixin.js';
import fb from '../utils/firebase.js';

const fields = {
  1: {adjacent: [2, 14], name: 'Karczma'},
  2: {adjacent: [3, 1], name: 'Mroźne Pustkowie'},
  3: {adjacent: [4, 2], name: 'Gród'},
  4: {adjacent: [5, 3], name: 'Bezdroża'},
  5: {adjacent: [6, 4], name: 'Studnia Wieczności'},
  6: {adjacent: [7, 5], name: 'Krąg Mocy'},
  7: {adjacent: [8, 6], name: 'Czarci Młyn'},
  8: {adjacent: [9, 7], name: 'Mokradła'},
  9: {adjacent: [10, 8], name: 'Step'},
  10: {adjacent: [11, 9], name: 'Osada'},
  11: {adjacent: [12, 10], name: 'Kurhan'},
  12: {adjacent: [13, 11], name: 'Mokradła'},
  13: {adjacent: [14, 12], name: 'Step'},
  14: {adjacent: [1, 13], name: 'Uroczysko'},
};

export default class MmPage extends dbSyncMixin('_page', LitElement) {
  static get properties() {
    return {
      uid: String,
      _page: Object,
    };
  }
  constructor() {
    super();
    (async () => {
      await this.updateComplete;
      this.path = fb.path(`pages/${this.uid}`);
    })();
  }
  getData(path) {
    return fb.get(path);
  }
  updateField(newField) {
    this._page = _.set('field', newField, this._page);
    return fb.update(this.path.extend('field'), newField);
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
      ${!this._page ? '' : html`
        ${this._page.field} ${fields[this._page.field].name}
        <br>
        <button @click=${() => this.updateField(fields[this._page.field].adjacent[0])}>counter clockwise</button>
        <button @click=${() => this.updateField(fields[this._page.field].adjacent[1])}>clockwise</button>
      `}
    `;
  }
}
customElements.define('mm-page', MmPage);
