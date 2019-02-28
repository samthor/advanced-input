import * as main from './main.js';

let regexpGroup = `[\\p{Letter}\\p{Number}\\p{Punctuation}]|\\uDBBF\\uDFE3|¯`;

try {
  new RegExp(regexpGroup, 'u');
} catch (e) {
  regexpGroup = '\\S';
}

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
}
#holder {
  position: relative;
  font-variant-ligatures: none;
  overflow: hidden;
  z-index: 0;
}
#input {
  display: inline-block;
  font: inherit;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  text-indent: var(--text-indent, 12px);
  overflow: hidden;
  line-height: 1.2em;  /* safari caret fix */
}
#input:focus {
  outline: none;
}
#input::selection {
  background: transparent;
}
#input::-moz-selection {
  background: transparent;
}

._align {
  position: absolute;
  z-index: -1;
}
._align > span {
  box-sizing: border-box;
  visibility: visible;
}
._align > span:not(:empty) {
  margin: -2px -1px;
  padding: 2px 1px;
  border-radius: 2px;
  color: transparent;
}
._align > span.selected {
  background: var(--selection-color, #33fc);
}

._align > span._highlight {
  background: var(--highlight-color, #ccca);
}

.autocomplete {
  opacity: 0.5;
  visibility: visible;
}

#target {
  visibility: hidden;
  z-index: -1;
  text-indent: var(--text-indent, 12px);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
  white-space: pre;
}
</style>
<div id="holder">
  <input type="text" id="input" />
  <div id="target"></div>
</div>
`;
    const target = root.getElementById('target');
    this._input = root.getElementById('input');
    this._input.value = this.getAttribute('value');

    this._controller = main.upgrade(this._input, target);
    this._controller.suggest = this.getAttribute('suggest');

    this._input.addEventListener(main.event.select, this._select.bind(this));
    this._input.addEventListener(main.event.nav, this._nav.bind(this));
  }

  get value() {
    return this._input.value;
  }

  set value(v) {
    // matches <input>, don't update attribute
    this._input.value = v;
  }

  get suggest() {
    return this._controller.suggest;
  }

  set suggest(v) {
    this._controller.suggest = v;
  }

  _select(ev) {
    if (this._input.selectionStart !== this._input.selectionEnd) {
      this._controller.mark('highlight');
      return;  // ignore range selection
    }

    const value = this._input.value;
    const anchor = this._input.selectionStart;
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
        this._input.value = newValue;
        break;
    }
  }
};
