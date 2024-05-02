import { adoptStyles, LitElement } from "lit";

export class VxElement extends LitElement {
  connectedCallback() {
    super.connectedCallback();

    const prototype = Object.getPrototypeOf(this);
    Object.values(Object.getOwnPropertyNames(prototype)).forEach((propKey) => {
      console.log(propKey, this[propKey], Object.getOwnPropertyDescriptor(prototype, propKey).get?.());
    });

    setTimeout(() => {
      adoptStyles(this.shadowRoot, document.adoptedStyleSheets);
    }, 50);
  }
}
