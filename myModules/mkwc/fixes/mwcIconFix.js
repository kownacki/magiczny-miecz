import {css} from 'lit-element';

// 1. Allows adding
export default (MwcIcon) =>
  class extends MwcIcon {
    static get styles() {
      return [super.styles, css`
        button {
          text-shadow: var(--mdc-icon-fixed-text-shadow);
        }
      `];
    }
  };
