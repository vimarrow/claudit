const { adoptStyles, LitElement } = window.mirai.pkgRegistry.get('lit');

export function VxElement(subjects) {
  return class extends LitElement {
    connectedCallback() {
      super.connectedCallback();

      this._subscribers = {};

      Object.keys(subjects).forEach((key) => {
        this._subscribers[key] = subjects[key]?.subscribe((newValue) => {
          this.stateChanged(key, newValue);
        })
      });

      setTimeout(() => {
        adoptStyles(this.shadowRoot, document.adoptedStyleSheets);
      }, 50);
    }

    stateChanged(key, val) {
      console.log(`Unhandled change for ${key}`);
    }

    disconnectedCallback() {
      Object.values(this._subscribers).forEach((sub) => {
        sub?.unsubscribe();
      });
      super.disconnectedCallback();
    }
  }
}
