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
const render = (render, text, annotations) => {
  let at = 0;
  render.textContent = '';

  for (const annot of annotations) {
    // insert text before this, unless there is none
    if (annot.start > at) {
      const node = document.createTextNode(text.substring(at, annot.start));
      render.appendChild(node);
      at = annot.start;
    }

    const el = document.createElement('span');
    el.className = 'selected';  // TODO
    el.textContent = text.substr(annot.start, annot.length);
    console.info('making annot', el.textContent, annot);
    render.appendChild(el);
  }

  // add trailer
  if (at < text.length) {
    const node = document.createTextNode(text.substr(at));
    render.appendChild(node);
  }
};


const drift = (low, high, text, where) => {
  if (where >= high) {
    where = where - (high - low) + text.length;  // after
  } else if (where > low) {
    where = low + text.length;  // during
  }
  return where;
};


export const upgrade = (input, render) => {
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
      if (style !== render.style.transform) {
        framesOk = 0;
        render.style.transform = style;
        return true;
      }
      return ++framesOk < checkForFrames;
    });
  })();

  // Handle left/right scroll on input.
  input.addEventListener('wheel', viewportChangeHint, {passive: true});

  const contentEvents = 'change keydown keypress input value select';
  const contentChangeHint = util.dedup(input, contentEvents, (events) => {
    console.debug('got change', events, input.value);
    const trim = input.value.replace(/\s+$/, '');
    render.textContent = trim;

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

      render.insertBefore(align, render.firstChild);
    });

    render.appendChild(autocompleteEl);
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

  // If a user is click or touch-dragging, this is changing the input selection and scroll.
  // Chrome and Safari generate 'selectionchange' events for selection within an <input>, and have
  // a (useless but exists) handler on the input itself. Firefox does not, so we have to listen to
  // drag events in case it's a selection change.
  const dragHelper = 'onselectionchange' in input ? viewportChangeHint : contentChangeHint;
  const drag = util.drag(dragHelper);
  input.addEventListener('mousedown', drag);
  input.addEventListener('touchstart', drag);

  // Fired only on Chrome/Safari (as of Firefox 45, it's behind a flag). Long-press select on
  // mobile doesn't generate "select".
  document.addEventListener('selectionchange', (ev) => {
    if (document.activeElement === input) {
      contentChangeHint('selectionchange');
    }
  });

  const focusEvents = 'click mousedown touchstart blur focus';
  const focusChangeHint = util.dedup(input, focusEvents, (events) => {
    if (events.has('mousedown') || events.has('touchstart')) {
      // Do nothing, the user has clicked or tapped to select on the input. Respect the selection
      // and scrollLeft of the user.
      // TODO(samthor): could retain selection by calling .setSelectionRange
    } else if (events.has('focus')) {
      // Focus has occured (not because of mouse), reset last known selection and scroll.
      input.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
      input.scrollLeft = state.scrollLeft;  // Safari also reset on focus
    } else if (events.has('blur')) {
      // nb. when we blur, the selectionStart/selectionEnd is lost
      input.scrollLeft = state.scrollLeft;
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

  const replace = (text, target) => {
    if (target === null) {
      target = {start: input.selectionStart, end: input.selectionEnd};
    }
    const prevFocus = document.activeElement;

    input.focus();
    input.setSelectionRange(target.start, target.end);
    console.info('input range before change', input.selectionStart, input.selectionEnd);

    const expected = input.value.substr(0, target.start) + text + input.value.substr(target.end);
    if (!document.execCommand('insertText', false, text) || input.value !== expected) {
      input.value = expected;  // execCommand isn't supported
      input.dispatchEvent(new CustomEvent('change'));
    } else {
      // execCommand generates 'input' event
    }

    const localDrift = drift.bind(null, target.start, target.end, text);
    state.selectionStart = localDrift(state.selectionStart);
    state.selectionEnd = localDrift(state.selectionEnd);
    console.info('input range after change', input.selectionStart, input.selectionEnd, 'vs state', state);

    if (prevFocus && prevFocus !== input) {
      // FIXME: this clears selection on input?
      prevFocus.focus();
    }
  };

  return {
    replace,
  };
};
