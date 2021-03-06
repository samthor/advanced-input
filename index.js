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


const scrollLeftWithTransform = true;


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


const previousLineAt = (value, index) => {
  if (index <= 0) {
    return 0;
  }
  const found = value.lastIndexOf('\n', index - 1);
  if (found !== -1) {
    return found + 1;
  }
  return 0;
};


const surroundingLine = (value, cursor) => {
  let start = previousLineAt(value, cursor);

  let nextIndex = value.indexOf('\n', cursor);
  if (nextIndex === -1) {
    nextIndex = value.length;
  }

  // if there's only whitespace on this line, walk back to previous line
  while (start > 0) {
    const check = value.substring(start, nextIndex);
    if (check.trim().length) {
      break;
    }
    nextIndex = start - 1;
    start = previousLineAt(value, start - 1);
  }

  return {
    start,
    end: nextIndex,
  };
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
  const constructor = input.constructor;  // either HTMLInputElement or HTMLTextAreaElement
  if (!(constructor === HTMLInputElement || constructor === HTMLTextAreaElement)) {
    throw new Error(`cannot upgrade element of type: ${prototype.toString()}`);
  }
  const prototype = constructor.prototype;
  const multiline = (constructor === HTMLTextAreaElement);
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

  const rectifyRows = multiline ? () => {
    render.appendChild(heightEl);  // nb. render now includes autocomplete
    const lineHeight = heightEl.offsetHeight;

    // Use round as Chrome sometimes gives us off-by-one errors in height for zoomed elements.
    const renderLines = Math.max(1, Math.round(render.offsetHeight / lineHeight));

    input.setAttribute('rows', renderLines);
  } : () => {};

  const viewportChangeHint = (() => {
    const checkForFrames = 20;  // run for this many frames after last change

    return util.checker((frames) => {
      // It's possible to have scrollLeft in a textarea if `white-space: pre`, so we have to run
      // this even for the multiline case.
      if (!input.scrollLeft && !util.isActive(input)) {
        // handle browsers setting scrollLeft to zero while non-focused
        input.scrollLeft = state.scrollLeft;
      } else {
        state.scrollLeft = input.scrollLeft;
      }

      const computedOffsetLeft = -input.scrollLeft;
      let alwaysRetry = false;

      if (scrollLeftWithTransform) {
        // faster but creates a z-index stacking context
        const style = `translate(${computedOffsetLeft}px)`;
        if (style !== render.style.transform) {
          render.style.transform = style;
          alwaysRetry = true;
        }
      } else {
        // might be useful if no stacking context is wanted (so annotations can be above AND below)
        const style = `${computedOffsetLeft}px`;
        if (style !== render.style.marginLeft) {
          render.style.marginLeft = style;
          alwaysRetry = true;
        }
      }

      rectifyRows();

      return alwaysRetry || frames < checkForFrames;
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

  // Firefox sometimes moves us around, but we cannot scroll up/down. This cannot be passive,
  // otherwise we don't get a chance to intercept the invalid value.
  input.addEventListener('scroll', () => {
    if (input.scrollTop) {
      input.scrollTop = 0;
    }
  });

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
    render.textContent = state.value;  // don't trim, need to align heightEl

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
      // const range = surroundingLine(state.value, state.selectionEnd);
      // console.debug('surrounding:`' + state.value.substring(range.start, range.end) + '`');

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

    // Finally, inform the textarea of how big we actually are.
    // nb. This code all relies on the current position/size.
    rectifyRows();
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
    actualSetSelectionRange(...args);  // this will fail if args.length < 2

    // nb. can't check for focus here as it might be transitioning away
    window.clearTimeout(hintFrame);
    hintFrame = window.setTimeout(() => {
      const change = input.selectionStart !== args[0] ||
          input.selectionEnd !== args[1] ||
          (args.length > 2 && input.selectionDirection !== args[2]);  // optional selectionDirection
      if (change) {
        // 2) if we were focused, the selection is wrong by end of frame
        actualSetSelectionRange(...args);
      }
    }, 0);

    // 3) Safari doesn't get a select event for some reason
    input.dispatchEvent(new CustomEvent('select'));
  };

  // For reason 2) above, we need to intercept the old-style approach of updating selection.
  const propertiesToOverride = ['selectionStart', 'selectionEnd', 'selectionDirection'];
  propertiesToOverride.forEach((prop) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, prop);
    Object.defineProperty(input, prop, {
      set(v) {
        descriptor.set.call(input, v);
        input.setSelectionRange(input.selectionStart, input.selectionEnd, input.selectionDirection);
      },
      get() {
        return descriptor.get.call(input);
      },
    });
  });

  // Non-deduped focusout handler, to fix scrollLeft on parting input.
  input.addEventListener('focusout', (ev) => {
    // This still flashes on older versions of Safari because rAF was implemented incorrectly:
    // https://bugs.webkit.org/show_bug.cgi?id=177484
    input.scrollLeft = state.scrollLeft;
    viewportChangeHint();
  });

  const dispatchSpaceEvent = (ev) => {
    const detail = {shiftKey: ev.shiftKey, metaKey: ev.metaKey, ctrlKey: ev.ctrlKey, altKey: ev.altKey};
    const spaceEvent = new CustomEvent(event.space, {detail, cancelable: true});
    input.dispatchEvent(spaceEvent);
    if (spaceEvent.defaultPrevented) {
      ev.preventDefault();
    }
  };

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
      dispatchSpaceEvent(ev);
      break;
    }
  });

  // Non-deduped textInput handler, for space on mobile browsers ('dreaded keycode 229').
  // Note that this will generate multiple events.
  input.addEventListener('textInput', (ev) => {
    if (ev.data === ' ') {
      dispatchSpaceEvent(ev);
    }
  });

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
     * @param {string|function(string): string} text to insert
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

      if (typeof text === 'function') {
        const prev = input.value.substring(target.start, target.end);
        text = text(prev);
      }

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
        input.setSelectionRange(target.start, target.start + text.length);
      } else if (target.start === target.end || selectionStartAfter > target.start) {
        // This was a zero-width replace, or the selection started after the replacement point.
        // Place the cursor after the new text.
        input.setSelectionRange(target.start + text.length, target.start + text.length);
      } else {
        // Put the cursor on the left. No drift or modification required.
        input.setSelectionRange(selectionStartAfter, selectionStartAfter);
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
