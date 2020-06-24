import {LitElement, html, css} from 'lit-element';
import sharedStyles from '../../src/styles/shared-styles.js';
import dbSyncMixin from './dbSyncMixin.js'
import './edit/mkwc-image.js';
import './edit/mkwc-text.js';

export default class MkwcBanner extends dbSyncMixin('_banner', LitElement) {
  static get properties() {
    return {
      enableEditing: Boolean,
      updateImage: Function,
      updateText: Function,
      maxWidth: Number,
      maxHeight: Number,
      noImage: {type: Boolean, reflect: true, attribute: 'no-image'},
      noSubheading: Boolean,
      _banner: Object,
    };
  }
  static get styles() {
    return [sharedStyles, css`
      :host {
        height: 100%;
        display: flex;
      }
      mkwc-image {
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        position: absolute;
        background: linear-gradient(to bottom,rgba(0,0,0,.4),transparent 45%);
      }
      .heading {
        background: rgba(var(--secondary-color-rgb), 0.5);
        padding: 20px;
        width: 1000px;
        max-width: 100%;
        margin: auto auto 0;
        text-align: center;
        text-transform: uppercase;
        z-index: 1;
      }
      h1 {
        margin: 10px;
        color: white;
      }
      p {
        font-weight: 300;
        font-size: 18px;
        margin: 10px;
        color: white;
      }
      :host([no-image]) {
        height: auto;
      }
      :host([no-image]) .heading {
        background: transparent;
      }
      :host([no-image]) h1, :host([no-image]) p {
        color: inherit;
      }
    `];
  }
  render() {
    return html`
      ${this.noImage ? '' : html`<mkwc-image
        .lowerImage=${true}
        .maxWidth=${this.maxWidth}
        .maxHeight=${this.maxHeight}
        .fit=${'cover'}
        .path=${this.path}
        .noGet=${true}
        .image=${_.get('image', this._banner)}
        .updateData=${this.updateImage}
        .enableEditing=${this.enableEditing}>
      </mkwc-image>`}
      <!--<div class="heading">
        ${_.map((field) => html`
          ${field === 'subheading' && this.noSubheading ? '' : html`<mkwc-text
            .path=${this.path}
            .noGet=${true}
            .text=${_.get(field, this._banner)}
            .ready=${this.ready}
            .updateData=${_.partial(this.updateText, [field])}
            .enableEditing=${this.enableEditing}>
            ${field === 'heading'
              ? html`<h1 class="horizontally-spacious-text"></h1>`
              : html`<p class="horizontally-spacious-text"></p>`
            }
          </mkwc-text>`}
        `, ['heading', 'subheading'])}
      </div>-->
    `;
  }
};
customElements.define('mkwc-banner', MkwcBanner);
