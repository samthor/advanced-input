
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
  resize: none;
  color: currentColor;
  padding: var(--padding, 0);
  box-sizing: border-box;
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

.aligner {
  pointer-events: none;
  position: absolute;
  inset: var(--padding, 0);
}

.align {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
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
.align span:not(:empty) {
  margin: 0 -1px;
  padding: 0 1px;
}
.align span:empty::before {
  content: '\u200b';
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


export class AdvancedInputElement extends HTMLElement {
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
        const event = new CustomEvent(name, { detail, cancelable: true });
        this.dispatchEvent(event);
        return event.defaultPrevented;
      };
    };

    this._controller = build({
      update,
      nav: buildDispatchHandler(eventNames.nav),
      spaceKey: buildDispatchHandler(eventNames.spaceKey),
    });

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

  focus() {
    super.focus();
    this._controller.focus();
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
