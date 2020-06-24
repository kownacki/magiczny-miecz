import MkwcEditableText from './mkwc-editable-text.js';
import dbSyncMixin from '../dbSyncMixin.js'

export default class MkwcText extends dbSyncMixin('text', MkwcEditableText) {
};
customElements.define('mkwc-text', MkwcText);
