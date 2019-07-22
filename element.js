import * as advancedInput from './index.js';

const regexpGroup = `[\\p{Letter}\\p{Number}\\p{Punctuation}]|\\uDBBF\\uDFE3|¯`;
const leftRe = new RegExp(`(?:${regexpGroup})*$`, 'u');
const rightRe = new RegExp(`^(?:${regexpGroup})*`, 'u');

export default class extends HTMLElement {
  static get observedAttributes() {
    return ['suggest', 'value'];
  }

  constructor() {
    super();

    const root = this.attachShadow({mode: 'open'});
    root.innerHTML = `
<style>
:host {
  display: inline-block;
  cursor: text;
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

.align {
  position: absolute;
  width: 100%;
  word-break: break-word;
}
.align > span {
  box-sizing: border-box;
  visibility: visible;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  margin: -2px -1px;
  padding: 2px 1px;
  border-radius: 2px;
  color: transparent;
  z-index: -1;
}
.align > span:empty {
  opacity: 0;
}

.align > span.selected {
  background: var(--selection-color, #33fc);
}
.align > span._highlight {
  background: var(--highlight-color, #ccca);
}

.align > span._test {
  background: red;
}

.autocomplete {
  opacity: 0.5;
  visibility: visible;
}

#render {
  z-index: -1;
  visibility: hidden;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* don't set bottom, in case we're a multiple and need to measure */

  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;

  /* for multiple */
  white-space: pre-wrap;
}

</style>
<div id="holder">
  <textarea id="textarea"></textarea>
  <div id="render"></div>
</div>
`;
    this._textarea = root.getElementById('textarea');
    this._textarea.value = this.getAttribute('value');

    const render = root.getElementById('render');
    this._controller = advancedInput.upgrade(this._textarea, render);
    this._controller.suggest = this.getAttribute('suggest');

    this._textarea.addEventListener(advancedInput.event.select, this._select.bind(this));
    this._textarea.addEventListener(advancedInput.event.nav, this._nav.bind(this));

    this.addEventListener('click', (ev) => {
      if (!ev.defaultPrevented) {
        this._textarea.focus();
      }
    });
  }

  get value() {
    return this._textarea.value;
  }

  set value(v) {
    this._textarea.value = v;
  }

  get suggest() {
    return this._controller.suggest;
  }

  set suggest(v) {
    this._controller.suggest = v;
  }

  get multiple() {
    return this.hasAttribute('multiple');
  }

  set multiple(v) {
    if (v) {
      this.setAttribute('multiple', this.getAttribute('multiple') || '');
    } else {
      this.removeAttribute('multiple');
    }
  }

  suggestMatch(cand) {
    return this._controller.autocompleteMatch(cand);
  }

  _updateInputType() {
    // TODO(samthor): make this work
  }

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

    this._controller.mark('highlight', {start, end});
  }

  _nav(ev) {
    ev.preventDefault();
  }

  mark(className, target) {
    this._controller.mark(className, target);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case 'suggest':
        this._controller.suggest = newValue;
        break;
      case 'value':
        this._textarea.value = newValue;
        break;
    }
  }
};
