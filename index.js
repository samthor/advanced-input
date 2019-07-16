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
  value = value.trimEnd();

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
  const multiline = (input.localName === 'textarea');
  const actualSetSelectionRange = input.setSelectionRange.bind(input);  // we replace this later

  const state = {
    scrollLeft: input.scrollLeft,
    selectionStart: -1,
    selectionEnd: -1,
    selectionDirection: '',
    value: input.value,
    suggest: '',
    markup: new Map(),
  };

  let annotationEls = [document.createDocumentFragment()];

  const autocompleteEl = document.createElement('span');
  autocompleteEl.className = 'autocomplete';

  const heightEl = document.createElement('span');
  heightEl.toggleAttribute('aria-hidden', true);
  heightEl.style.display = 'inline-block';  // needed to correctly compare to textarea height
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

      // Adjust translate based on zoom, needed for WebKit-origin browsers. Round to the nearest 5%
      // (Firefox does single %, but it's not effected, this value will always be 1).
      const ratio = Math.round((window.outerWidth / window.innerWidth) * 20) / 20;

      const style = `translate(${-input.scrollLeft * ratio}px)`;
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

      state.value = input.value;
      state.selectionDirection = selectionDirection;
      state.selectionStart = input.selectionStart;
      state.selectionEnd = input.selectionEnd;

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
    render.textContent = state.value.trimEnd();

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
      });
    });

    // Find and render as much of the autocomplete is remaining.
    if (!rangeSelection) {
      const found = autocompleteSuffix(state.value, state.selectionEnd, state.suggest);
      if (found >= 0) {
        const suffix = state.suggest.substr(found);
        autocompleteEl.textContent = '\u200b' + suffix;  // zero-width space here
        render.appendChild(autocompleteEl);
      }
      if (found) {
        annotations.push({
          start: input.value.length - found,
          length: found,
          className: 'trailer',
        });
      }
    }

    // TODO(samthor): Even in single-line mode, we create nodes that match the full text
    // in most annotation cases. This should be O(1) so we space out duplicates.
    annotationEls = annotations.map(({start, length, className}) => {
      const align = document.createElement('div');
      align.className = 'align';
      align.textContent = state.value.substr(0, start);  // include trailing space

      const span = document.createElement('span');
      span.className = className;
      span.textContent = state.value.substr(start, length);
      if (!span.textContent.length) {
        // otherwise inline element might not have a valid offsetHeight
        span.style.display = 'inline-block';
      }
      align.appendChild(span);

      if (length) {
        const rest = document.createTextNode(state.value.substr(start + length));
        align.appendChild(rest);
      }

      render.insertBefore(align, render.firstChild);

      return span;
    });

    // Inform the textarea of how big we actually are.
    // nb. This code all relies on the current position/size.
    if (multiline) {
      render.appendChild(heightEl);  // nb. render now includes autocomplete
      const lineHeight = heightEl.offsetHeight;
      const renderLines = Math.max(1, ~~(render.offsetHeight / lineHeight));
      input.setAttribute('rows', renderLines);
    }
  });

  contentChangeHint();

  // If a user is click or touch-dragging, this is changing the input selection and scroll.
  // We can't use 'selectionchange', even though it is supported on Chrome and Safari, as it does
  // not fire inside a shadow root.
  // TODO: only needed for <input>?
  util.drag(input, contentChangeHint);

  // Check for focus, but not via a pointer. Reset last known selection and scroll. This is moot
  // for <textarea> (but only in Chrome), as there's no implicit select behavior.
  const dedupFocus = util.dedup(input, 'mousedown touchstart focus', (events) => {
    if (events.has('mousedown') || events.has('touchstart') || events.has(null)) {
      // Do nothing, focus has occured via user interaction or setSelectionRange
    } else {
      actualSetSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
      input.scrollLeft = state.scrollLeft;  // Safari needs this on focus
    }
  });

  // This awkwardly does a couple of things.
  //   1) Replaces setSelectionRange so that, when called, the dedupFocus dedup above doesn't nuke
  //      programmatic changes (since browsers might not be able to distinguish tab-and-select-all).
  //   2) Ensures that the browser doesn't ignore changes while focused or _losing_ focus (for
  //      Chrome), by calling actualSetSelectionRange in the next frame.
  //   3) Makes sure a 'select' event is fired (needed for Safari).
  let hintFrame = 0;
  input.setSelectionRange = (...args) => {
    dedupFocus();  // 1) prevent nuking programmatic changes
    actualSetSelectionRange(...args);

    // nb. can't check for focus here as it might be transitioning away
    window.clearTimeout(hintFrame);
    hintFrame = window.setTimeout(() => {
      if (input.selectionStart !== args[0] || input.selectionEnd !== args[1]) {
        // 2) if we were focused, the selection is wrong by end of frame
        actualSetSelectionRange(...args);
      }
    }, 0);

    // 3) Safari doesn't get a select event for some reason
    input.dispatchEvent(new CustomEvent('select'));
  };

  // Non-deduped focusout handler, to fix scrollLeft on parting input.
  input.addEventListener('focusout', (ev) => {
    // This still flashes on older versions of Safari because rAF was implemented incorrectly:
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
        const l = input.value.length;
        actualSetSelectionRange(l, l);
        break;
      } else if (state.selectionDirection === 'backward') {
        actualSetSelectionRange(state.selectionStart, state.selectionStart);
      } else {
        actualSetSelectionRange(state.selectionEnd, state.selectionEnd);
      }
      ev.preventDefault();
      break;

    case 'ArrowUp':
    case 'Up':
      dir = -1;
      // fall-through

    case 'ArrowDown':
    case 'Down':
      const selectionEl = annotationEls[0];
      if (multiline) {
        if (dir === -1 && state.selectionStart === 0) {
          // great, at start
        } else if (dir === +1 && state.selectionEnd >= input.value.length) {
          // great, at end
        } else if (selectionEl && heightEl.parentNode && input.rows !== 1) {
          // ... if multiline, everything is sane, and it isn't just on one single line _anyway_
          // then prevent sending nav unless the user is on top or bottom of textarea
          const lineHeight = heightEl.offsetHeight;
          if (dir === -1) {
            const startLine = ~~(selectionEl.offsetTop / lineHeight);
            if (startLine !== 0) {
              break;  // nothing to do, not on line=0
            }
          } else if (input.offsetHeight - lineHeight > selectionEl.offsetTop + selectionEl.offsetHeight) {
            break;  // not on the last line
          }
        }
      }

      const at = selectionEl ? selectionEl.offsetLeft - input.scrollLeft : 0;
      const navEvent = new CustomEvent(event.nav, {detail: {dir, at}});
      input.dispatchEvent(navEvent);
      if (!util.hasFocus(input)) {
        ev.preventDefault();  // focus changed, disable default up/down behavior
      }
      break;

    case ' ':
      const spaceEvent = new CustomEvent(event.space, {detail: false, cancelable: true});
      input.dispatchEvent(spaceEvent);
      if (spaceEvent.defaultPrevented) {
        ev.preventDefault();
      }
      break;
    }
  });

  // Non-deduped keyup handler, for space on mobile browsers ('dreaded keycode 229').
  input.addEventListener('keyup', (ev) => {
    // was it a 229 or no code, and was the typed character a space?
    if (ev.keyCode === 229 || !ev.keyCode) {
      // TODO: possibly record hasPendingSpace for future arriving suggestions
      // FIXME: disable space if defaultPrevented
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
     * @param {boolean=} wholeReplace if true, does not drift cursor relative to update
     * @return {{start: number, end: number}} updated replaced range
     */
    replace(text, target=null, wholeReplace=false) {
      const selection = !target;
      if (selection) {
        target = {start: state.selectionStart, end: state.selectionEnd};
      }
      const selectionStartAfter = state.selectionStart;  // retain for later

      const expected = input.value.substr(0, target.start) + text + input.value.substr(target.end);

      input.focus();
      input.setSelectionRange(target.start, target.end);

      if (document.execCommand('insertText', false, text) && input.value === expected) {
        // execCommand generates 'input' event, don't dispatch
      } else {
        // execCommand didn't work, is unsupported in HTML form elements (e.g. Firefox)
        input.value = expected;
        input.dispatchEvent(new CustomEvent('change'));
      }

      if (!wholeReplace) {
        // nb. This means that e.g. replacing "abc" with "def" will attempt to retain the cursor
        // position, say if it was directly after 'a'.
        const d = drift.bind(null, target.start, target.end, text);
        const selectionStart = d(state.selectionStart);
        const selectionEnd = d(state.selectionEnd);
        input.setSelectionRange(selectionStart, selectionEnd, state.selectionDirection);
      } else if (selection) {
        // Select entire new range (old selection => new selection).
        typer.setSelectionRange(target.start, target.start + text.length);
      } else if (target.start === target.end || selectionStartAfter > target.start) {
        // This was a zero-width replace, or the selection started after the replacement point.
        // Place the cursor after the new text.
        typer.setSelectionRange(target.start + text.length, target.start + text.length);
      } else {
        // Put the cursor on the left. No drift or modification required.
        typer.setSelectionRange(selectionStartAfter, selectionStartAfter);
      }

      return {start: target.start, end: target.start + text.length};
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
     * @param {string} className to find mark
     * @return {?{start: number, end: number}}
     */
    find(className) {
      const prev = state.markup.get(className);
      if (prev === undefined) {
        return null;
      }
      // copy result
      return {start: prev.start, end: prev.end};
    },

    /**
     * @param {string} s to match against
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
      state.suggest = v || '';
      contentChangeHint();
    },

    /**
     * @return {string}
     */
    get suggest() {
      return state.suggest;
    },

  };
};
