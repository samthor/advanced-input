import AdvancedInputElement, { eventNames } from './element.js';

const el = /** @type {AdvancedInputElement} */ (document.querySelector('advanced-input'));

const controlMultiline = /** @type {HTMLInputElement} */ (document.getElementById('control-multiline'));
controlMultiline.addEventListener('change', () => {
  el.multiline = controlMultiline.checked;
});

const controlTrailer = /** @type {HTMLInputElement} */ (document.getElementById('control-trailer'));
controlTrailer.addEventListener('change', () => {
  el.trailer = controlTrailer.value;
});
controlTrailer.addEventListener('input', () => {
  el.trailer = controlTrailer.value;
});

// TODO: might barf in Firefox
const regexpGroup = `[\\p{Letter}\\p{Number}\\p{Punctuation}]|\\uDBBF\\uDFE3|¯`;
const leftRe = new RegExp(`(?:${regexpGroup})*$`, 'u');
const rightRe = new RegExp(`^(?:${regexpGroup})*`, 'u');

function findMark() {
  const controller = el.controller;

  if (controller.selectionStart !== controller.selectionEnd) {
    return;  // ignore range selection
  }

  const value = controller.value;
  const anchor = controller.selectionStart;
  const leftMatch = leftRe.exec(value.substr(0, anchor));
  const rightMatch = rightRe.exec(value.substr(anchor));

  const start = anchor - (leftMatch?.[0].length ?? 0);
  const end = anchor + (rightMatch?.[0].length ?? 0);

  if (start === end) {
    return;
  }

  return { start, end };
}

el.addEventListener(eventNames.select, (event) => {
  const controller = el.controller;
  console.debug('cursor at', controller.cursor());

  controller.mark('highlight', findMark());
});

el.focus();
