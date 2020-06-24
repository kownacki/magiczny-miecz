import {css} from 'lit-element';

// 1. Adds a line under label when textarea is scrolled. Set line color with --mdc-textarea-fixed-divider-color.
// 2. Allows scrolling textarea when disabled
export default (MwcTextarea) =>
  class extends MwcTextarea {
    constructor() {
      super();
      (async () => {
        await this.updateComplete;
        const textarea = this.shadowRoot.querySelector('textarea');
        textarea.addEventListener('scroll', _.throttle(100,
          () => textarea.style.borderColor = textarea.scrollTop > 0
            ? 'var(--mdc-textarea-fixed-divider-color)'
            : 'transparent'
        ));
        Object.assign(textarea.style, {
          borderTop: 'solid 1px transparent',
          lineHeight: '1.4em',
          marginTop: '30px',
          paddingTop: '10px',
          paddingBottom: '10px',
        });
      })();
    }
    static get styles() {
      return [super.styles, css`
        /* Allow scrolling textarea when disabled */
        :host([disabled]) label {
          pointer-events: auto;
        }
      `];
    }
  };
