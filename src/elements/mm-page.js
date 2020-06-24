import {LitElement, html, css} from 'lit-element';
import {unsafeHTML} from 'lit-html/directives/unsafe-html.js';
import dbSyncMixin from 'mkwc/dbSyncMixin.js';
import fb from '../utils/firebase.js';

const fields = {
  1: {adjacent: [2, 14], name: 'Karczma', description: `MUSISZ RZUCIĆ KOSTKĄ:
1 - przegrałeś w kości 1 Sz. Z;
2 - wygrałeś 1 Sz. Z;
3 - musisz tu nocować, tracisz 1 turę;
4 - musisz stawić czoła miejscowemu osiłkowi (Miecz 4);
5 - poczęstowano cię eliksirem, dzięki któremu możesz przenieść się do dowolnego miejsca w tym Kręgu;
6 - eliksir, który ci podano może przenieść cię do Świątyni Nemed.`},
  2: {adjacent: [3, 1], name: 'Mroźne Pustkowie', description: `WYCIĄGNIJ 1 KARTĘ.
Nie ciągnij Karty jeśli jakaś już tu jest.`},
  3: {adjacent: [4, 2], name: 'Gród', description: `MOŻESZ TU ODWIEDZIĆ:
<strong>Wróżbitę</strong>: rzuć kostką
1 - zyskujesz 1 Zaklęcie;
2 - zostajesz Zaklęty w Kamień;
3 - jeżeli jesteś Zły stajesz się Dobry. Jeżeli jesteś Chaotyczny stajesz się Zły;
4-6 zostałeś zignorowany.
<strong>Lichwiarza</strong> - możesz wymienić dowolne Przedmioty na złoto (odłóż ich Karty i weź po 1 Sz. Z za każdy).`},
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
