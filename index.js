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
 * @return {number} display from this character (or -1 for invalid)
 */
const autocompleteSuffix = (value, from, autocomplete) => {
  if (!autocomplete) {
    return -1;
  }

  // FIXME(samthor): case-insensitivity is opinionated.
  // FIXME(samthor): it would be nice to also only start on word boundary
  const check = autocomplete.toLowerCase();
  const min = Math.max(0, from - autocomplete.length);
  const tail = value.substr(min).toLowerCase();

  for (let i = 0; i < tail.length; ++i) {
    if (check.startsWith(tail.substr(i))) {
      return tail.length - i;
    }
  }

  // return autocomplete if at end
  return (from < value.length ? -1 : 0);
};


export const upgrade = (input, render) => {
  const state = {
    scrollLeft: input.scrollLeft,
    selectionStart: -1,
    selectionEnd: -1,
    selectionDirection: '',
    value: input.value,
    autocomplete: '',
    markup: new Map(),
  };

  const autocompleteEl = document.createElement('span');
  autocompleteEl.className = 'autocomplete';

  const heightEl = document.createElement('span');
  heightEl.textContent = '\u200b';

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
    // TODO(samthor): this leaks the handler
    window.addEventListener('resize', (ev) => viewportChangeHint());
  }

  // Handle left/right scroll on input.
  input.addEventListener('wheel', viewportChangeHint, {passive: true});
  input.addEventListener('scroll', viewportChangeHint, {passive: true});

  const contentEvents = 'change keydown keypress input value select click contextmenu mousedown touchstart';
  const contentChangeHint = util.dedup(input, contentEvents, (events) => {
    viewportChangeHint(true);  // most things cause viewport to change

    const valueChange = (state.value !== input.value);
    const selectionChange = (state.selectionStart !== input.selectionStart ||
        state.selectionEnd !== input.selectionEnd);
    const anyChange = valueChange || selectionChange;

    if (!events.has(null) && !anyChange) {
      return;  // no change
    }

    const rangeSelection = (input.selectionEnd > input.selectionStart);

    if (anyChange) {
      // retain in case the element is blurred
      state.selectionStart = input.selectionStart;
      state.selectionEnd = input.selectionEnd;
      state.selectionDirection = input.selectionDirection;
      state.value = input.value;

      // write `data-selection` to element
      if (rangeSelection) {
        const value = state.value.substring(state.selectionStart, state.selectionEnd);
        input.setAttribute('data-selection', value);
      } else {
        input.removeAttribute('data-selection');
      }

      // optionally clear invalid markup and inform client of selection
      if (valueChange) {
        // TODO(samthor): if unrelated text is modified (before/after) we could drift these values
        for (const k of state.markup.keys()) {
          const {rev} = state.markup.get(k);
          if (rev !== state.value) {
            state.markup.delete(k);
          }
        }
      }

      // something changed, and the value may have changed: clients should do markup again
      const detail = {change: valueChange};
      input.dispatchEvent(new CustomEvent(event.select, {detail}));
    }

    // rerender text (always do this for now, clears annotations)
    render.textContent = state.value;

    const annotations = [
      {
        start: input.selectionStart,
        length: input.selectionEnd - input.selectionStart,
        className: 'selected',
      },
    ];
    state.markup.forEach(({start, end}, value) => {
      annotations.push({
        start,
        length: end - start,
        className: '_' + value,
      })
    });

    annotations.forEach(({start, length, className}) => {
      const align = document.createElement('div');
      align.className = '_align';
      align.textContent = state.value.substr(0, start);  // include trailing space

      const span = document.createElement('span');
      span.className = className;
      span.textContent = state.value.substr(start, length);
      align.appendChild(span);

      render.insertBefore(align, render.firstChild);
    });

    // Find and render as much of the autocomplete is remaining.
    if (!rangeSelection) {
      const found = autocompleteSuffix(state.value, state.selectionEnd, state.autocomplete);
      if (found >= 0) {
        const suffix = state.autocomplete.substr(found);
        autocompleteEl.textContent = '\u200b' + suffix;  // zero-width space here
        render.appendChild(autocompleteEl);
      }
    }

    // Inform the textarea of how big we actually are.
    if (input.localName === 'textarea') {
      render.appendChild(heightEl);  // nb. render now includes autocomplete
      const renderLines = ~~(render.offsetHeight / heightEl.offsetHeight);
      input.setAttribute('rows', Math.max(1, renderLines));
    }
  });

  contentChangeHint();

  // If a user is click or touch-dragging, this is changing the input selection and scroll.
  // We can't use 'selectionchange', even though it is supported on Chrome and Safari, as it does
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
      if (!ce.defaultPrevented) {
        break;
      }

      if (input.localName === 'textarea') {
        // .. check textarea content if the caller wants to disable nav
        let check;
        if (dir === -1) {
          check = input.value.substr(0, input.selectionStart);
        } else {
          check = input.value.substr(input.selectionEnd);
        }
        if (check.indexOf('\n') !== -1) {
          break;
        }
      }

      ev.preventDefault();  // disable normal up/down behavior to change focus
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
     * @param {{start: number, end: number}=} target to apply at, or selection
     */
    replace(text, target={start: state.selectionStart, end: state.selectionEnd}) {
      const prevFocus = document.activeElement;

      input.focus();
      input.setSelectionRange(target.start, target.end);

      const expected = input.value.substr(0, target.start) + text + input.value.substr(target.end);
      if (!document.execCommand('insertText', false, text) || input.value !== expected) {
        // execCommand isn't supported in HTML form elements (e.g. Firefox)
        input.value = expected;
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
     * @param {string} className to use
     * @param {?{start: number, end: number}=} target to apply to, or null to clear
     */
    mark(className, target=null) {
      if (target) {
        state.markup.set(className, {
          start: target.start,
          end: target.end,
          rev: input.value,
        });
      } else if (state.markup.has(className)) {
        state.markup.delete(className);
      } else {
        return false;
      }
      contentChangeHint();
    },

    /**
     * @param {strin} s to match against
     * @return {number} how much of this autocomplete string matches, -1 for invalid
     */
    autocompleteMatch(s) {
      if (input.selectionStart !== input.selectionEnd) {
        return -1;
      }
      return autocompleteSuffix(input.value, input.selectionStart, s);
    },

    /**
     * @param {?string} v to suggest
     */
    set suggest(v) {
      state.autocomplete = v || '';
      contentChangeHint();
    },

    /**
     * @return {string}
     */
    get suggest() {
      return state.autocomplete;
    },

  };
};
