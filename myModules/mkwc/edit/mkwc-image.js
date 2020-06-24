import MkwcEditableImage from './mkwc-editable-image.js';
import dbSyncMixin from '../dbSyncMixin.js'

export default class MkwcImage extends dbSyncMixin('image', MkwcEditableImage) {
  static get properties() {
    return {
      image: Object,
    };
  }
  constructor() {
    super();
    this.addEventListener('updated', async (event) => this.image = event.detail);
  }
  updated(changedProperties) {
    if (changedProperties.has('image')) {
      this.src = _.get('url', this.image);
    }
    super.updated(changedProperties);
  }
};
customElements.define('mkwc-image', MkwcImage);
