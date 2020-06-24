import {LitElement, html, css, unsafeCSS} from 'lit-element';
import {unsafeHTML} from 'lit-html/directives/unsafe-html.js';
import loadingDots from 'mk-web-utils/loadingDots.js'

export default class MkwcLoadingDots extends LitElement {
  static get properties() {
    return {};
  }
  static get styles() {
    return css`
      :host {
        display: block;
      }
      ${unsafeCSS(loadingDots.css(true))}
    `;
  }
  render() {
    return html`
      ${unsafeHTML(loadingDots.html())}
    `;
  }
}
customElements.define('mkwc-loading-dots', MkwcLoadingDots);
