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
  } else if (where <= low + text.length) {
    // during, retain
  } else {
    where = low + text.length;  // during but after length, go to end
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

  let annotationEls = [document.createDocumentFragment()];

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

  const retainForBlur = (selectionDirection = undefined) => {
    if (selectionDirection !== undefined) {
      state.selectionDirection = selectionDirection;
      state.value = input.value;
    } else {
      state.value = undefined;  // used by non-deduped 'focusout' handler to force redraw
    }
    state.selectionStart = input.selectionStart;
    state.selectionEnd = input.selectionEnd;
  };

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
      let selectionDirection = input.selectionDirection;
      if (selectionDirection === 'none' && rangeSelection) {
        // browsers don't always report this with mouse input
        if (!selectionChange) {
          // selection didn't change, use previous guess
          selectionDirection = state.selectionDirection || selectionDirection;
        } else if (input.selectionStart === state.selectionStart) {
          selectionDirection = 'forward';   // start was same, end (right) moved
        } else {
          selectionDirection = 'backward';  // end was same, start (left) moved
        }
      }

      // retain in case the element is blurred
      retainForBlur(selectionDirection);

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

    // TODO(samthor): Even in single-line mode, we create nodes that match the full text
    // in most annotation cases. This should be O(1) so we space out duplicates.
    annotationEls = annotations.map(({start, length, className}) => {
      const align = document.createElement('div');
      align.className = '_align';
      align.textContent = state.value.substr(0, start);  // include trailing space

      const span = document.createElement('span');
      span.className = className;
      span.textContent = state.value.substr(start, length);
      align.appendChild(span);

      if (length) {
        const rest = document.createTextNode(state.value.substr(start + length));
        align.appendChild(rest);
      }

      render.insertBefore(align, render.firstChild);

      return span;
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

  const focusHint = util.dedup(input, 'mousedown touchstart focus', (events) => {
    if (events.has('mousedown') || events.has('touchstart')) {
      // Do nothing, focus has occured via user interaction.
    } else {
      // Focus has occured but not via a pointer. Reset last known selection and scroll. 
      input.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
      input.scrollLeft = state.scrollLeft;  // Safari needs this on focus
    }
  });

  // Non-deduped focusout handler, to fix scrollLeft on parting input.
  input.addEventListener('focusout', (ev) => {
    // Retain state at moment of blur. Otherwise, a corner case occurs with buttons pressed while
    // the input has focus, and the selection is lost.
    retainForBlur();

    // This still flashes on Safari because it implements rAF wrong:
    // https://bugs.webkit.org/show_bug.cgi?id=177484
    input.scrollLeft = state.scrollLeft;
    viewportChangeHint();
  });

  // Non-deduped keydown handler, for intercepting space and others.
  input.addEventListener('keydown', (ev) => {
    let dir = +1;

    switch (ev.key) {
    case 'Escape':
      if (state.selectionStart === state.selectionEnd) {
        break;
      } else if (state.selectionDirection === 'backward') {
        input.setSelectionRange(state.selectionStart, state.selectionStart);
      } else {
        input.setSelectionRange(state.selectionEnd, state.selectionEnd);
      }
      ev.preventDefault();
      break;

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
        // TODO: can we determine if we're on top or bottom line of textarea?
        break;
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

  window._state = state;

  return {

    /**
     * @return {{x: number, y: number}} approx cursor position _within_ typer
     */
    cursor() {
      const selected = annotationEls[0];
      const out = {
        x: selected.offsetLeft - input.scrollLeft,
        y: selected.offsetTop - input.scrollTop,
      };
      return out;
    },

    /**
     * @param {string} text to insert
     * @param {{start: number, end: number}=} target to apply at, or selection
     */
    replace(text, target) {
      target = target || {start: state.selectionStart, end: state.selectionEnd};
      const expected = input.value.substr(0, target.start) + text + input.value.substr(target.end);

      this.select(target, () => {
        if (document.execCommand('insertText', false, text) && input.value === expected) {
          // execCommand generates 'input' event, don't dispatch
        } else {
          // execCommand didn't work, is unsupported in HTML form elements (e.g. Firefox)
          input.value = expected;
          input.dispatchEvent(new CustomEvent('change'));
        }

        // nb. This means that e.g. replacing "abc" with "def" will attempt to retain the cursor
        // position, say if it was directly after 'a'. This isn't the behavior that Emojityper
        // usually wants, as this is a replacement that should focus _after_.
        const d = drift.bind(null, target.start, target.end, text);
        const selectionStart = d(state.selectionStart);
        const selectionEnd = d(state.selectionEnd);
        input.setSelectionRange(selectionStart, selectionEnd, state.selectionDirection);
      });
    },

    /**
     * @param {{start: number, end: number}} target to select
     * @param {?function(): void=} handler to run _during_ selection
     */
    select(target, handler=null) {
      const prevFocus = document.activeElement;

      input.focus();
      input.setSelectionRange(target.start, target.end);

      handler && handler();

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
