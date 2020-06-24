import mwcIconFix from './mwcIconFix.js';
import {IconButton as MwcIconButton} from '@material/mwc-icon-button';

customElements.define('mwc-icon-button-fixed', class extends mwcIconFix(MwcIconButton) {});
