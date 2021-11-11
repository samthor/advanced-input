
// // TODO: might barf in Firefox
// const regexpGroup = `[\\p{Letter}\\p{Number}\\p{Punctuation}]|\\uDBBF\\uDFE3|¯`;
// const leftRe = new RegExp(`(?:${regexpGroup})*$`, 'u');
// const rightRe = new RegExp(`^(?:${regexpGroup})*`, 'u');

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
  white-space: break-spaces;
  white-space: pre-wrap;
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
}
.align span {
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  border-radius: 2px;
  background: currentColor;
  visibility: visible;
}
align span:not(:empty) {
  margin: 0 -1px;
  padding: 0 1px;
}
align span:empty {
  /* fixes zero-width el */
  display: inline-block;
}

</style>
<div id="holder"></div>
    `;

    return t.content.cloneNode(true);
  }

})();

const t = document.createElement('template');

export default class AdvancedInputElement extends HTMLElement {
  _controller;

  static get observedAttributes() {
    return ['suggest', 'value'];
  }

  constructor() {
    super();

    const controller = build({

      nav(dir) {
        console.warn('nav', dir);
        return true;
      },

      update(change) {
        if (change) {

        }
      },

    });

    this._controller = controller;

    const root = this.attachShadow({ mode: 'open' });
    root.append(lazyTemplate());

    const holder = /** @type {HTMLElement} */ (root.lastElementChild);
    holder.append(this._controller.fragment);

    // const render = root.getElementById('render');
    // this._controller = advancedInput.upgrade(this._textarea, render);
    // this._controller.suggest = this.getAttribute('suggest');

    // this._textarea.addEventListener(advancedInput.event.select, this._select.bind(this));
    // this._textarea.addEventListener(advancedInput.event.nav, this._nav.bind(this));
  }

  get value() {
    return this._controller.value;
  }

  set value(v) {
    this._controller.value = v;
  }

  // get suggest() {
  //   return this._controller.suggest;
  // }

  // set suggest(v) {
  //   this._controller.suggest = v;
  // }

  _select(ev) {
    this.dispatchEvent(new CustomEvent(ev.type));

    if (this._textarea.selectionStart !== this._textarea.selectionEnd) {
      this._controller.mark('highlight');
      return;  // ignore range selection
    }

    const value = this._textarea.value;
    const anchor = this._textarea.selectionStart;
    const leftMatch = leftRe.exec(value.substr(0, anchor));
    const rightMatch = rightRe.exec(value.substr(anchor));

    const start = anchor - leftMatch[0].length;
    const end = anchor + rightMatch[0].length;

    this._controller.mark('highlight', { start, end });
  }

  _nav(ev) {
    ev.preventDefault();
  }

  mark(className, target) {
    this._controller.mark(className, target);
  }

  /**
   * @param {string} name
   * @param {string?} oldValue
   * @param {string?} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case 'value':
        this._controller.value = newValue ?? '';
        break;
    }
  }
};


customElements.define('advanced-input', AdvancedInputElement);
