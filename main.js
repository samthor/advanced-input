/**
 * @fileoverview Non-WC entrypoint to advanced-input. Upgrades an input and
 * renders to another.
 */

import * as util from './util.js';


export const event = Object.seal({
  space: '_space',
  nav: '_nav',
});

/*
 * This looks for three classes of events:
 *
 *   1. Change events. e.g., `change`, `keydown`: to rerender text
 *   2. Focus events. e.g., `focus`, `mousedown`: to fix scroll left, announce cursor
 *   3. Viewport events. e.g., `scroll`: to align preview
 */

 /**
  * @param {!HTMLElement} el
  * @param {string} text 
  * @param {!Array<{object, start, length}>} annotations 
  */
const render = (target, text, annotations) => {
  let at = 0;
  target.textContent = '';

  for (const annot of annotations) {
    // insert text before this, unless there is none
    if (annot.start > at) {
      const node = document.createTextNode(text.substring(at, annot.start));
      target.appendChild(node);
      at = annot.start;
    }

    const el = document.createElement('span');
    el.className = 'selected';  // TODO
    el.textContent = text.substr(annot.start, annot.length);
    console.info('making annot', el.textContent, annot);
    target.appendChild(el);
  }

  // add trailer
  if (at < text.length) {
    const node = document.createTextNode(text.substr(at));
    target.appendChild(node);
  }
};


export const upgrade = (input, target) => {
  const state = {
    scrollLeft: input.scrollLeft,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
    selectionDirection: input.selectionDirection,
  };

  const autocompleteEl = document.createElement('span');
  autocompleteEl.className = 'autocomplete';

  const viewportChangeHint = (() => {
    let framesOk = 0;
    const checkForFrames = 10;  // run for this many frames after last change

    return util.checker(() => {
      state.scrollLeft = input.scrollLeft;

      const style = `translate(${-input.scrollLeft}px)`;
      if (style !== target.style.transform) {
        framesOk = 0;
        target.style.transform = style;
        return true;
      }
      return ++framesOk < checkForFrames;
    });
  })();

  // Handle left/right scroll on input.
  input.addEventListener('wheel', viewportChangeHint, {passive: true});

  // If a user is click or touch-dragging, this is changing the input selection and scroll.
  const drag = util.drag(viewportChangeHint);
  input.addEventListener('mousedown', drag);
  input.addEventListener('touchstart', drag);

  const contentEvents = 'change keydown keypress input value';
  const contentChangeHint = util.dedup(input, contentEvents, (events) => {
    const trim = input.value.replace(/\s+$/, '');
    target.textContent = trim;

    const annotations = [
      {
        start: input.selectionStart,
        length: input.selectionEnd - input.selectionStart,
        object: null,
      },
    ];
    annotations.forEach(({start, length}) => {
      const align = document.createElement('div');
      align.className = '_align';
      align.textContent = trim.substr(0, start);

      const span = document.createElement('span');
      span.className = 'selected';  // ??
      span.textContent = trim.substr(start, length);
      align.appendChild(span);

      target.insertBefore(align, target.firstChild);
    });

    target.appendChild(autocompleteEl);
    const cand = 'butt';
    autocompleteEl.textContent = cand;

    for (let i = 0; i < cand.length; ++i) {
      const test = cand.substr(0, cand.length - i);
      if (trim.endsWith(test)) {
        autocompleteEl.textContent = cand.substr(cand.length - i);
        break;
      }
    }

    // retain in case the element is blurred
    state.selectionStart = input.selectionStart;
    state.selectionEnd = input.selectionEnd;
    state.selectionDirection = input.selectionDirection;

    if (state.selectionEnd > state.selectionStart) {
      const value = input.value.substring(state.selectionStart, state.selectionEnd);
      input.setAttribute('data-value', value);
    } else {
      input.removeAttribute('data-value');
    }

    // input might cause viewport to change
    viewportChangeHint();
  });

  // Also fired on others, but Chrome mobile needs `selectionchange` to handle a long-press select.
  document.addEventListener('selectionchange', (ev) => {
    if (document.activeElement === input) {
      contentChangeHint('selectionchange');
    }
  });

  const focusEvents = 'click mousedown touchstart select blur focus';
  const focusChangeHint = util.dedup(input, focusEvents, (events) => {
    // Browsers reset scrollLeft when we navigate away from the input, but we can just tell it to
    // go back to what it was.
    if (events.has('blur')) {
      input.scrollLeft = state.scrollLeft;
    } else if (events.has('mousedown') || events.has('touchstart')) {
      // do nothing: user clicked to select
    } else if (events.has('focus')) {
      input.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
      input.scrollLeft = state.scrollLeft;  // Safari also reset on focus
    } else {
      // TODO(samthor): work out if 'click' or 'select' were useful?
      console.info('got useless', events);
    }
  });

  // Non-deduped keydown handler, for intercepting space and others.
  input.addEventListener('keydown', (ev) => {
    let dir = +1;

    switch (ev.key) {
    case 'ArrowUp':
    case 'Up':
      dir = -1;
      // fall-through

    case 'ArrowDown':
    case 'Down':
      const ce = new CustomEvent(event.nav, {detail: dir, cancelable: true});
      input.dispatchEvent(ce);
      if (ce.defaultPrevented) {
        ev.preventDefault();  // disable normal up/down behavior to change focus
      }
      break;

    case ' ':
      input.dispatchEvent(new CustomEvent(event.space, {detail: false}));
      break;
    }
  });

  // Non-deduped keyup handler, for space on mobile browsers ('dreaded keycode 229').
  input.addEventListener('keyup', (ev) => {
    // was it a 229 or no code, and was the typed character a space?
    if (ev.keyCode === 229 || !ev.keyCode) {
      // TODO: possibly record hasPendingSpace for future arriving suggestions
      input.dispatchEvent(new CustomEvent(event.space, {detail: true}));
    }
  });
};
