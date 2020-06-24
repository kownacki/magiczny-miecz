window.auth = firebase.auth();
window.db = firebase.firestore();
window.storage = firebase.storage();

auth.onAuthStateChanged((user) => {window.loggedIn = Boolean(user)});

import {LitElement, html, css} from 'lit-element';
import sharedStyles from './styles/shared-styles.js';
import './elements/mm-page.js';

customElements.define('mm-app', class extends LitElement {
  static get properties() {
    return {
    };
  }
  static get styles() {
    return [sharedStyles, css`
      :host {
        --mdc-theme-primary: var(--primary-color);
      }
    `];
  }
  render() {
    return html`
      <mm-page .uid=${'landing'}></mm-page>
    `;
  }
});
