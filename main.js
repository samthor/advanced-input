/**
 * @fileoverview Non-WC entrypoint to advanced-input. Upgrades an input and
 * renders to another.
 */

import * as util from './util.js';


export const event = Object.seal({
  select: '_select',
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

  const min = Math.max(0, from - autocomplete.length);
  const tail = value.substr(min).toLowerCase();

  for (let i = 0; i < tail.length; ++i) {
    if (autocomplete.startsWith(tail.substr(i))) {
      const displayFrom = tail.length - i;
      return autocomplete.substr(displayFrom);
    }
  }

  // return autocomplete if at end
  return (from < value.length ? null : autocomplete);
};


export const upgrade = (input, render) => {
  const state = {
    scrollLeft: input.scrollLeft,
    selectionStart: -1,
    selectionEnd: -1,
    selectionDirection: '',
    value: input.value,
    autocomplete: '',
  };
  const events = new util.EventController();

  const autocompleteEl = document.createElement('span');
  autocompleteEl.className = 'autocomplete';

  const viewportChangeHint = (() => {
    const checkForFrames = 20;  // run for this many frames after last change

    return util.checker((frames) => {
      if (!input.scrollLeft && !util.isActive(input)) {
        // handle browsers setting scrollLeft to zero while non-focused
        input.scrollLeft = state.scrollLeft;
      } else {
        state.scrollLeft = input.scrollLeft;
      }

      const style = `translate(${-input.scrollLeft}px)`;
      if (style !== render.style.transform) {
        render.style.transform = style;
        return true;
      }
      return frames < checkForFrames;
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
  input.addEventListener('scroll', viewportChangeHint, {passive: true});

  const contentEvents = 'change keydown keypress input value select click contextmenu mousedown touchstart';
  const contentChangeHint = util.dedup(input, contentEvents, (events) => {
    viewportChangeHint(true);  // most things cause viewport to change

    if (state.selectionStart === input.selectionStart &&
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

    // nb. this might cause autocomplete to update
    input.dispatchEvent(new CustomEvent(event.select));

    const endsWithSpace = !!/\s$/.exec(state.value);
    render.textContent = state.value;

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
      align.textContent = state.value.substr(0, start);  // include trailing space

      const span = document.createElement('span');
      span.className = 'selected';  // ??
      span.textContent = state.value.substr(start, length);
      align.appendChild(span);

      render.insertBefore(align, render.firstChild);
    });

    // Find and render as much of the autocomplete is remaining.
    if (!rangeSelection) {
      const found = autocompleteSuffix(state.value, state.selectionEnd, state.autocomplete);
      if (found) {
        autocompleteEl.textContent = found;
        render.appendChild(autocompleteEl);
      }
    }
  });
  contentChangeHint();

  // If a user is click or touch-dragging, this is changing the input selection and scroll.
  // We can't use 'selectionchange', even though they're supported on Chrome and Safari, as it does
  // not fire inside a shadow root.
  util.drag(input, contentChangeHint);

  const focusEvents = 'mousedown touchstart focus';
  const focusChangeHint = util.dedup(input, focusEvents, (events) => {
    if (events.has('mousedown') || events.has('touchstart')) {
      // Do nothing, the user has clicked or tapped to select on the input. Respect the selection
      // and scrollLeft of the user.
    } else if (events.has('focus')) {
      // Focus has occured (not because of pointer), reset last known selection and scroll.
      input.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
      input.scrollLeft = state.scrollLeft;  // Safari also reset on focus
    }
  });

  // Non-deduped focusout handler, to fix scrollLeft on parting input.
  input.addEventListener('focusout', (ev) => {
    // This still flashes on Safari because it implements rAF wrong:
    // https://bugs.webkit.org/show_bug.cgi?id=177484
    input.scrollLeft = state.scrollLeft;
    viewportChangeHint();
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
