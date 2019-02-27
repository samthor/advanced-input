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
 *   1. Change events. e.g., `change`, `keydown`: to rerender text (including selection)
 *   2. Focus events. e.g., `focus`, `mousedown`: to fix scroll left, announce cursor
 *   3. Viewport events. e.g., `scroll`: to align preview
 */


const drift = (low, high, text, where) => {
  if (where >= high) {
    where = where - (high - low) + text.length;  // after
  } else if (where > low) {
    where = low + text.length;  // during
  }
  return where;
};


/**
 * @param {string} value to autocomplete from
 * @param {string} from cursor position
 * @param {string} autocomplete string to match
 * @return {?string} suffix autocomplete to display
 */
const autocompleteSuffix = (value, from, autocomplete) => {
  if (!autocomplete) {
    return null;
  }
  from = Math.min(value.length, from);
  value = value.substr(Math.max(0, value.length - autocomplete.length)).toLowerCase();
  autocomplete = autocomplete.toLowerCase();

  let found = autocomplete;
  for (let i = 1; i < autocomplete.length; ++i) {
    const use = autocomplete.length - i;
    if (value.length - from > use) {
      return null;  // don't autocomplete past the word length
    }
    const test = autocomplete.substr(0, use);
    if (value.endsWith(test)) {
      return autocomplete.substr(autocomplete.length - i);
    }
  }

  // nb. return null here to make zero state NOT autocomplete
  return autocomplete;
};


export const upgrade = (input, render) => {
  const state = {
    scrollLeft: input.scrollLeft,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
    selectionDirection: input.selectionDirection,
    value: input.value,
    autocomplete: '',
  };
  const events = new util.EventController();

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

  if ('ResizeObserver' in self) {
    const ro = new ResizeObserver(viewportChangeHint);
    ro.observe(input);
  } else {
    events.add(window, 'resize', (ev) => viewportChangeHint(), {passive: true});
  }

  // Handle left/right scroll on input.
  input.addEventListener('wheel', viewportChangeHint, {passive: true});

  const contentEvents = 'change keydown keypress input value select';
  const contentChangeHint = util.dedup(input, contentEvents, (events) => {
    viewportChangeHint(true);  // most things cause viewport to change

    if (!events.has(true) &&
        state.selectionStart === input.selectionStart &&
        state.selectionEnd === input.selectionEnd &&
        state.value === input.value) {
      return;  // no change
    }

    // retain in case the element is blurred
    state.selectionStart = input.selectionStart;
    state.selectionEnd = input.selectionEnd;
    state.selectionDirection = input.selectionDirection;
    state.value = input.value;
    const rangeSelection = (state.selectionEnd > state.selectionStart);

    // write `data-selection` to element
    if (rangeSelection) {
      const value = state.value.substring(state.selectionStart, state.selectionEnd);
      input.setAttribute('data-selection', value);
    } else {
      input.removeAttribute('data-selection');
    }
    if (!events.has('select')) {
      input.dispatchEvent(new CustomEvent('select'));
    }

    const trim = state.value.replace(/\s+$/, '');
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

    // Find and render as much of the autocomplete is remaining.
    if (!rangeSelection) {
      const found = autocompleteSuffix(trim, state.selectionEnd, state.autocomplete);
      if (found) {
        autocompleteEl.textContent = found;
        render.appendChild(autocompleteEl);
      }
    }
  });
  contentChangeHint(true);

  // If a user is click or touch-dragging, this is changing the input selection and scroll.
  // Chrome and Safari generate 'selectionchange' events for selection within an <input>, and have
  // a (useless but exists) handler on the input itself. Firefox does not, so we have to listen to
  // drag events in case it's a selection change.
  const hasSelectionChange = 'onselectionchange' in input;
  const dragHelper = hasSelectionChange ? viewportChangeHint : contentChangeHint;
  util.drag(input, dragHelper);

  // Without 'selectionchange', a click event is a way of changing the selection.
  if (!hasSelectionChange) {
    input.addEventListener('click', (ev) => contentChangeHint('click'));
  }

  // Fired only on Chrome/Safari (as of Firefox 45, it's behind a flag). Long-press select on
  // mobile doesn't generate "select".
  events.add(document, 'selectionchange', (ev) => {
    if (document.activeElement === input) {
      contentChangeHint('selectionchange');
    }
  });

  const focusEvents = 'mousedown touchstart blur focus';
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
      throw new Error(`unhandled: ${[...events].join(',')}`);
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

  return {

    /**
     * @param {string} text to insert
     * @param {{start: number, end: number}|null} target to apply at, or selection
     */
    replace(text, target) { 
      if (target === null) {
        target = {start: input.selectionStart, end: input.selectionEnd};
      }
      const prevFocus = document.activeElement;

      input.focus();
      input.setSelectionRange(target.start, target.end);

      const expected = input.value.substr(0, target.start) + text + input.value.substr(target.end);
      if (!document.execCommand('insertText', false, text) || input.value !== expected) {
        input.value = expected;  // execCommand isn't supported on <input>
        input.dispatchEvent(new CustomEvent('change'));
      } else {
        // execCommand generates 'input' event
      }

      const localDrift = drift.bind(null, target.start, target.end, text);
      state.selectionStart = localDrift(state.selectionStart);
      state.selectionEnd = localDrift(state.selectionEnd);

      if (prevFocus && prevFocus !== input) {
        prevFocus.focus();
      }
    },

    /**
     * @param {?string} v to suggest
     */
    set suggest(v) {
      state.autocomplete = v || '';
    },

    /**
     * @return {string}
     */
    get suggest() {
      return state.autocomplete;
    },

  };
};
