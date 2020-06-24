import {LitElement, html, css} from 'lit-element';
import moveOutFromShadowDom from 'mk-web-utils/moveOutFromShadowDom.js';
import '../mkwc-loading-dots.js';
import '@material/mwc-button';

export default class extends LitElement {
  static get properties() {
    return {
      text: String,
      ready: {type: Boolean, reflect: true},
      enableEditing: Boolean,
      disabled: Boolean,
      showControls: Boolean,
      //todo rich and lessRich into one property
      rich: Boolean,
      richConfig: String, // 'mosaic' / 'intro' / default full
      multiline: {type: Boolean, reflect: true},
      float: {type: Boolean, reflect: true},
      scrollOffset: Number,
      _editable: Element,
      _editor: Element,
      _editorSet: Boolean,
    };
  }
  constructor() {
    super();
    (async () => {
      await this.updateComplete;
      this._setEditable();
      const editableStyle = getComputedStyle(this._editable);
      this._editable.style.minHeight = `${parseFloat(editableStyle.lineHeight) / parseFloat(editableStyle.fontSize)}em`;
    })();
  }
  _checkIfEmpty(isCkeditor) {
    const text = isCkeditor ? this._editor.getData() : this._editable.innerText ;
    if (_.replace(/\s/g, '', text)) {
      this.setAttribute('not-empty', '');
    } else {
      this.removeAttribute('not-empty');
    }
  }
  _setEditable() {
    let slotted = this.querySelector('*');
    while (slotted.tagName === 'SLOT') {
      slotted = slotted.assignedElements()[0];
    }
    this._editable = (slotted.shadowRoot && slotted.shadowRoot.getElementById('editable')) || slotted;
  }
  async _setEditor() {
    this._editable.addEventListener("focus", () => {
      this._editable.style['text-transform'] = "initial";
    });
    this._editable.addEventListener("blur", () => {
      this._editable.style['text-transform'] = null;
    });
    if (this.rich) {
      await this._setCkeditor();
      this._editor.model.document.on('change:data', () => {
        this.showControls = true;
        this._checkIfEmpty(true);
      });
    } else {
      this._editable.addEventListener('input', () => {
        this.showControls = true;
        this._checkIfEmpty();
      });
    }
  }
  async _setCkeditor() {
    await Promise.all([
      import('@ckeditor/ckeditor5-build-inline/build/ckeditor.js'),
      moveOutFromShadowDom(this._editable),
    ]);
    this._editor = await InlineEditor.create(
      this._editable,
      {
        fontColor: {
          colors: [
            {
              color: 'var(--primary-color)',
              label: 'Primary'
            },
          ],
          columns: 1,
          documentColors: 0,
          // ...
        },
        mediaEmbed: {
          previewsInData: true
        },
        link: {
          decorators: [
            {
              mode: 'manual',
              label: 'Downloadable',
              attributes: {
                download: 'download'
              }
            },
            {
               mode: 'manual',
               label: 'Open in a new tab',
               attributes: {
                 target: '_blank',
               }
             }
          ]
        },
        ...(this.richConfig === 'heading' ? {
              removePlugins: _.flow([
                _.map(_.get('pluginName')),
                _.without(['Essentials', 'Autoformat', 'Alignment', 'Bold', 'Font', 'Italic', 'Paragraph']),
              ])(InlineEditor.builtinPlugins),
              toolbar: ['bold', 'italic', 'fontColor', 'alignment', 'undo', 'redo'],
            }
          : this.richConfig === 'mosaic'
          ? {
              removePlugins: _.flow([
                _.map(_.get('pluginName')),
                _.without(['Essentials', 'Autoformat', 'Alignment', 'Bold', 'Italic', 'Link', 'List', 'Paragraph']),
              ])(InlineEditor.builtinPlugins),
              toolbar: ['bold', 'italic', 'link', 'bulletedList', 'numberedList', 'undo', 'redo'],
            }
          : this.richConfig === 'intro'
          ? {
            removePlugins: _.flow([
              _.map(_.get('pluginName')),
              _.without(['Essentials', 'Autoformat', 'Bold', 'Italic', 'Link', 'Paragraph']),
            ])(InlineEditor.builtinPlugins),
            toolbar: ['bold', 'italic', 'link', 'undo', 'redo'],
          }
        : {}),
      }
    );
  }
  async updated(changedProperties) {
    if (changedProperties.has('showControls')) {
      this.dispatchEvent(new CustomEvent('show-controls-changed', {detail: this.showControls, composed: true, bubbles: true}));
      //todo add also when changing location
      //todo multiple onbeforeunload overlapping
      window.onbeforeunload = !this.showControls ? null : () => {
        this._editable.scrollIntoView();
        window.scrollBy(0, -this.scrollOffset);
        this._editable.focus();
        return '';
      };
    }
    if (changedProperties.has('ready') && this.ready) {
      this._editable.innerHTML = this.text || (this.rich ? '<p></p>' : '');
      this._checkIfEmpty();
    }
    if (changedProperties.has('_editable') || changedProperties.has('ready') || (changedProperties.has('enableEditing'))) {
      if (this._editable && this.ready && this.enableEditing) {
        if (!this._editorSet) {
          this._editorSet = true;
          this._setEditor();
        }
      }
    }
    if (changedProperties.has('disabled')
      || changedProperties.has('ready')
      || changedProperties.has('_editable')
      || changedProperties.has('enableEditing')
    ) {
      if (this._editable) {
        //todo empty textfield has height 0 when contenteditable set to false
        this._editable.setAttribute('contenteditable', !(this.disabled || !this.ready || !this.enableEditing));
      }
    }
  }
  static get styles() {
    return css`
      :host {
        display: block;
        position: relative;
      }
      :host(:not([ready])), :host([disabled]) {
        opacity: 50%;
      }
      :host([multiline]) {
        height: 150px;
      }
      :host([multiline]) ::slotted(*) {
        height: 100%;
      }
      :host([multiline][not-empty]) {
        height: auto;
      }
      ::slotted(*) {
        min-width: 20px;
      }
      :host(:not([not-empty])) ::slotted(:not(:focus)) {
        /*todo background only to #editable */
        background: rgba(var(--placeholder-color-rgb), 0.5);
      }
      .edit {
        margin-top: 5px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      .edit:not([hidden]) {
        display: flex;
      }
      :host([float]) .edit {
        position: absolute;
        top: 100%;
        right: 0;
      }
      mwc-button {
        --mdc-theme-primary: white;
        --mdc-theme-on-primary: black;
        margin-left: 10px;
      }
    `;
  }
  render() {
    return html`
      ${this.ready ? '' : html`<mkwc-loading-dots></mkwc-loading-dots>`}
      <slot id="text"></slot>
      ${!this.enableEditing || !this.showControls ? '' : html`
        <div class="edit">
          ${_.map((button) => html`
            <mwc-button
              .label=${button.label}
              .raised=${true}
              @click=${() => {
                button.click();
                this.showControls = false;
              }}>
            </mwc-button>
          `, [
            {
              label: 'Cancel', 
              click: () => {
                this.rich ? this._editor.setData(this.text || '') : (this._editable.innerHTML = this.text || '');
                this._checkIfEmpty(this.rich);
              }
            }, {
              label: 'Save',
              click: () => {
                if (this.rich) {
                  this.text = this._editor.getData()
                } else {
                  this.text = (this._editable.innerText || '');
                  // Normalize any html copied into.
                  this._editable.innerHTML = this.text;
                }
                this.dispatchEvent(new CustomEvent('save', {detail: this.text}));
              }
            }
          ])}
        </div>
      `}
    `;
  }
}
