import * as main from './main.js';

export default class extends HTMLElement {
  static get observedAttributes() {
    return ['value'];
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
  overflow-y: hidden;
  line-height: normal;  /* safari caret fix */
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
  background: var(--selection-color, #ccc7);
  margin: -2px -1px;
  padding: 2px 1px;
  border-radius: 2px;
  color: transparent;
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
  }

  get value() {
    return this._input.value;
  }

  set value(v) {
    // matches <input>, don't update attribute
    this._input.value = v;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case 'value':
        this._input.value = newValue;
        break;
      case 'suggest':
        this._controller.suggest = newValue;
        break;
    }
  }
};
