import {css} from 'lit-element';

export default css`
  body, :host {
    line-height: 1.25;
    font-size: 20px;
  }
  .smaller-text {
    font-size: 18px;
  }
  .bigger-text {
    font-size: 24px;
  }
  p {
    line-height: 1.4;
  }
  h1 {
    font-size: 48px;
  }
  h2 {
    font-size: 40px;
  }
  h3 {
    font-size: 32px;
  }
  h1, h2, h3 {
    word-break: break-word;
    font-weight: 300;
    margin: 0;
    text-align: center;
  }
  .content-heading {
    padding: 0 20px;
    margin: 30px auto;
    width: 800px;
    max-width: 100%;
    box-sizing: border-box;
  }
  .divider {
    border-bottom: solid 1px rgba(var(--secondary-color-rgb), 30%);
    margin-bottom: 20px;
  }
  .fixed-height-element {
    border: solid 1px var(--divider-color);
    background: rgba(var(--placeholder-color-rgb), 0.03);
    border-radius: 2px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  @media all and (max-width: 959px) {
    body, :host {
      font-size: 18px;
    }
    .smaller-text {
      font-size: 17px;
    }
    .bigger-text {
      font-size: 23px;
    }
    h1 {
      font-size: 40px;
    }
    h2 {
      font-size: 32px;
    }
    h3 {
      font-size: 28px;
    }
  }
  @media all and (max-width: 599px) {
    body, :host {
      font-size: 16px;
    }
    .smaller-text {
      font-size: 15px;
    }
    .bigger-text {
      font-size: 20px;
    }
    h1 {
      font-size: 32px;
    }
    h2 {
      font-size: 28px;
    }
    h3 {
      font-size: 24px;
    }
  }
  [hidden] {
    display: none !important;
  }
`;
