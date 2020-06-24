import {LitElement, html, css} from 'lit-element';
import {sleep} from 'mk-utils/general.js';

customElements.define('mkwc-image-upload', class extends LitElement {
  static get properties() {
    return {
    };
  }
  static get styles() {
    return css`
      :host {
        display: none;
      }
    `;
  }
  // We assume that upload was canceled if 300ms lasted after focusing window
  // see https://bit.ly/2V0F6DB
  async upload() {
    return new Promise((resolve) => {
      const input = this.shadowRoot.getElementById('input');
      // Resolve as soon as a file is uploaded
      const changeHandler = (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        resolve(file);
      };
      input.addEventListener('change', changeHandler, {once: true});
      // Wait at most 300ms until assuming upload was canceled
      window.addEventListener('focus', async () => {
        await sleep(300);
        if (!input.files.length) {
          input.removeEventListener('change', changeHandler);
          resolve(false);
        }
      }, {once: true});

      this.shadowRoot.getElementById('input').click();
    })
  }
  render() {
    return html`
      <input id="input" type="file" accept="image/png, image/jpeg">
    `;
  }
});
