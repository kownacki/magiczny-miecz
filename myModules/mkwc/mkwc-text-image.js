import {LitElement, html, css} from 'lit-element';
import sharedStyles from "../../src/styles/shared-styles";
import ckContent from '../../src/styles/ck-content.js'
import dbSyncMixin from './dbSyncMixin.js';
import './edit/mkwc-image.js';
import './edit/mkwc-text.js';

export default class MkwcTextImage extends dbSyncMixin('_textImage', LitElement) {
  static get properties() {
    return {
      enableEditing: Boolean,
      updateImage: Function,
      updateText: Function,
      imageMaxWidth: Number,
      imageMaxHeight: Number,
      h3: {type: Boolean},
      swap: {type: Boolean, reflect: true},
      _textImage: Object,
    };
  }
  constructor() {
    super();
    this.imageMaxWidth = '400';
    this.imageMaxHeight = '400';
  }
  static get styles() {
    return [sharedStyles, ckContent, css`
      :host {
        max-width: 1100px;
        margin: 80px auto;
        padding: 0 20px;
        display: flex;
      }
      :host([swap]) {
        flex-direction: row-reverse;
      }
      mkwc-image {
        min-width: 400px;
        width: 400px;
        height: 400px;
        border-radius: 50%;
        overflow: hidden;
      }
      .content {
        margin: 40px 0 40px 40px;
      }
      h2, h3 {
        margin-top: 0;
      }
      mkwc-icon-info {
        margin: 20px 0;
      }
      :host([icons-at-end]) mkwc-icon-info[] {
        margin-bottom: 0;
      }
      mkwc-action-buttons {
        margin-top: 30px;
      }
      @media all and (max-width: 839px) {
        :host, :host([swap]) {
          flex-direction: column;
        }
        mkwc-image, mkwc-image-slider {
          margin: auto;
        }
        .content {
          width: auto;
          margin: 30px 0 0;
        }
      }
      @media all and (max-width: 599px) {
        :host {
          margin: 60px auto;
        }
      }
      @media all and (max-width: 439px) {
        mkwc-image {
          min-width: auto;
          width: 260px;
          height: 260px;
        }
      }
    `];
  }
  render() {
    return html`
      <mkwc-image
        .maxWidth=${this.imageMaxWidth}
        .maxHeight=${this.imageMaxHeight}
        .fit=${'cover'}
        .path=${this.path}
        .noGet=${true}
        .image=${_.get('image', this._textImage)}
        .updateData=${this.updateImage}
        .enableEditing=${this.enableEditing}>
      </mkwc-image>
      <div class="content">
        ${_.map((field) => html`
          <mkwc-text
            .multiline=${field === 'text'}
            .rich=${field === 'text'}
            .richConfig=${field === 'text' ? 'mosaic' : undefined}
            .path=${this.path}
            .noGet=${true}
            .text=${_.get(field, this._textImage)}
            .ready=${this.ready}
            .updateData=${_.partial(this.updateText, [field])}
            .enableEditing=${this.enableEditing}>
            ${field === 'heading'
              ? (!this.h3 ? html`<h2></h2>` : html`<h3></h3>`)
              : html`<div class="text ck-content"></div>`
            }
          </mkwc-text>
        `, ['heading', 'text'])}
      </div>
    `;
  }
}
customElements.define('mkwc-text-image', MkwcTextImage);
