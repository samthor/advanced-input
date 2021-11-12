
import { build } from "./controller.js";

/** @type {() => Node} */
const lazyTemplate = (() => {

  /** @type {HTMLTemplateElement?} */
  let t = null;

  return () => {
    if (t) {
      return t.content.cloneNode(true);
    }
    t = document.createElement('template');
    t.innerHTML = `
<style>
:host {
  display: inline-block;
}

#holder {
  position: relative;
  font-variant-ligatures: none;
  z-index: 0;
}

textarea {
  display: block;
  width: 100%;
  font: inherit;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  overflow: hidden;
  resize: none;  /* in case we are textarea */
}
textarea:focus {
  outline: none;
}
textarea::selection {
  background: transparent;
}
textarea::-moz-selection {
  background: transparent;
}

/* TODO: just for now */
textarea {
  box-shadow: 0 0 4px red;
}

.text {
  white-space: pre-wrap;
  white-space: break-spaces;
  overflow-wrap: break-word;
}
.text:not(textarea) {
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
  visibility: hidden;
}

.sizer {
  position: absolute;
  width: 100%;
}

.align {
  position: absolute;
  inset: 0;
  width: 100%;
  z-index: -1;
}
.align span {
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  border-radius: 2px;
  background: currentColor;
  visibility: visible;
  color: transparent;
}
.align span:not(.empty) {
  margin: 0 -1px;
  padding: 0 1px;
}

.align span[part="trailer"] {
  color: currentColor;
  background: transparent;
}

</style>
<div id="holder"></div>
    `;

    return t.content.cloneNode(true);
  }

})();


export const eventNames = Object.seal({
  change: '-adv-change',
  select: '-adv-select',
  nav: '-adv-nav',
  spaceKey: '-adv-spaceKey',
});


export default class AdvancedInputElement extends HTMLElement {
  _controller;

  static get observedAttributes() {
    return ['value', 'trailer'];
  }

  constructor() {
    super();

    /** @type {(change: boolean) => void} */
    const update = (change) => {
      if (change) {
        this.dispatchEvent(new CustomEvent(eventNames.change));
      }
      this.dispatchEvent(new CustomEvent(eventNames.select));
    };

    /** @type {(name: string) => (detail: any) => boolean} */
    const buildDispatchHandler = (name) => {
      return (detail) => {
        const event = new CustomEvent(name, { detail });
        this.dispatchEvent(event);
        return event.defaultPrevented;
      };
    };

    const controller = build({
      update,
      nav: buildDispatchHandler(eventNames.nav),
      spaceKey: buildDispatchHandler(eventNames.spaceKey),
    });

    this._controller = controller;

    const root = this.attachShadow({ mode: 'open' });
    root.append(lazyTemplate());

    const holder = /** @type {HTMLElement} */ (root.lastElementChild);
    holder.append(this._controller.fragment);
  }

  get controller() {
    return this._controller;
  }

  get value() {
    return this._controller.value;
  }

  set value(v) {
    this._controller.value = v;
  }

  get trailer() {
    return this._controller.trailer;
  }

  set trailer(v) {
    this._controller.trailer = v;
  }

  get multiline() {
    return this._controller.multiline;
  }

  set multiline(v) {
    this._controller.multiline = v;
  }

  /**
   * @param {string} name
   * @param {string?} oldValue
   * @param {string?} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case 'value':
        this.value = newValue ?? '';
        break;

      case 'trailer':
        this.trailer = newValue ?? '';
        break;
    }
  }
};


customElements.define('advanced-input', AdvancedInputElement);
