import mwcTextareaFix from './mwcTextareaFix.js';
import {TextArea as MwcTextarea} from '@material/mwc-textarea';

customElements.define('mwc-textarea-fixed', class extends mwcTextareaFix(MwcTextarea) {});
