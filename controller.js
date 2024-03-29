
import * as controllerTypes from './types/controller.js';


const verticalKeys = ['ArrowUp', 'Up', 'ArrowDown', 'Down'];


const newlineRegexp = /\n/g;


/**
 * @param {Partial<controllerTypes.AdvancedInputCallbacks>} callbacks
 * @return {controllerTypes.AdvancedInputController}
 */
export function build(callbacks) {
  const textarea = document.createElement('textarea');
  textarea.className = 'text';

  // TODO: for now, treat as totally unmanaged
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('spellcheck', 'false');

  const renderHolderNode = document.createElement('div');
  renderHolderNode.className = 'aligner';

  const renderNode = document.createElement('div');
  renderNode.className = 'text sizer';
  renderNode.setAttribute('aria-hidden', 'true');
  renderHolderNode.append(renderNode);

  const alignHolderNode = document.createElement('div');
  alignHolderNode.className = 'aligner';
  alignHolderNode.setAttribute('aria-hidden', 'true');

  let selectionRangeElement = document.createElement('span');

  // Set up a fake selection element. We don't use this afterwards, it's just so the selection
  // element above can always exist and be on the page.
  const fakeInitialHolder = document.createElement('div');
  fakeInitialHolder.append(selectionRangeElement);
  alignHolderNode.append(fakeInitialHolder);

  const heightHelperNode = document.createElement('span');
  heightHelperNode.textContent = '\u200b';

  /** @type {Map<string, controllerTypes.Annotation>} */
  const userAnnotations = new Map();

  const state = {
    value: '',
    selectionStart: -1,  // start with always invalid value
    selectionEnd: 0,
    /** @type {typeof HTMLTextAreaElement.prototype.selectionDirection} */
    selectionDirection: 'none',

    minRows: 1,
    multiline: false,
    trailer: '',
  };

  const viewportChangeHint = () => {
    renderNode.append(heightHelperNode);  // nb. render now includes autocomplete

    // We need the floating-point height here in case the browser is zoomed.
    // Don't bother with the renderNode, as it tends to get large enough not to matter: just round
    // to avoid off-by-one errors.
    const lineHeight = heightHelperNode.getBoundingClientRect().height;
    const renderLines = Math.max(1, Math.floor(state.minRows), Math.round(renderNode.offsetHeight / lineHeight));
    textarea.rows = renderLines;
  };

  // If the textarea changes size (left/right), the number of rows it needs will change.
  const ro = new ResizeObserver(viewportChangeHint);
  ro.observe(textarea);

  let duringContentChangeHint = false;
  let pendingMarkupChange = false;
  let pendingTrailerChange = false;
  let pendingValueChange = false;

  const contentEvents = 'change keydown keypress input value select click contextmenu mousedown touchstart';
  const contentChangeHint = dedupListener(textarea, contentEvents, (events) => {
    duringContentChangeHint = true;
    try {
      const unexpectedValueChange = (state.value !== textarea.value);
      const selectionChange = (state.selectionStart !== textarea.selectionStart ||
        state.selectionEnd !== textarea.selectionEnd);
      const anyValueChange = unexpectedValueChange || pendingValueChange || pendingMarkupChange;

      if (!anyValueChange && !selectionChange) {
        return;
      }
      if (unexpectedValueChange || pendingTrailerChange) {
        // This condition is kind of gross but basically stops trailers changes from nuking marks.
        if (unexpectedValueChange || (!pendingValueChange && !pendingTrailerChange)) {
          userAnnotations.clear();   // change from user in browser, not cleared already :shrug:
        }
        pendingValueChange = false;

        if (!state.multiline) {
          const v = textarea.value.replace(newlineRegexp, ' ');
          if (v !== textarea.value) {
            // TODO: We don't "fix" bad values, because it kills the undo/redo stack.
            // Instead, there's a paste/keydown handler for the likely cases of invalid contents.
          }
        }
        renderNode.textContent = textarea.value + '\u200b' + state.trailer;
        pendingTrailerChange = false;
        viewportChangeHint();
      }

      const rangeSelection = (textarea.selectionEnd > textarea.selectionStart);

      let selectionDirection = textarea.selectionDirection;
      if (selectionDirection === 'none' && rangeSelection) {
        // browsers don't always report this with mouse input
        if (!selectionChange) {
          // selection didn't change, use previous guess
          selectionDirection = state.selectionDirection || selectionDirection;
        } else if (textarea.selectionStart === state.selectionStart) {
          selectionDirection = 'forward';   // start was same, end (right) moved
        } else {
          selectionDirection = 'backward';  // end was same, start (left) moved
        }
      }

      Object.assign(state, {
        value: textarea.value,
        selectionDirection,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      });

      // We can just re-render things that are effected by cursor moves. We do this early so the
      // callbacks can find our position.
      const selectionAnnotation = {
        start: Math.min(state.selectionStart, state.selectionEnd),
        end: Math.max(state.selectionStart, state.selectionEnd),
        name: 'selected',
      };
      const selectionRender = renderAnnotation(state.value, selectionAnnotation);
      selectionRangeElement?.parentElement?.replaceWith(selectionRender.align);
      selectionRangeElement = selectionRender.range;

      // Something changed, and the value may have changed. Clients can do markup again here.
      // Nothing visible on the controller is changed below (public visible state), we just
      // reconcile the underlying <textarea> after this.
      if (selectionChange || anyValueChange) {
        callbacks.update?.(anyValueChange);

        // This might happen as part of the callback, even though it wasn't reset.
        if (pendingTrailerChange) {
          renderNode.textContent = textarea.value + '\u200b' + state.trailer;
          pendingTrailerChange = false;
          viewportChangeHint();
        }
      }

      if (!anyValueChange && !pendingMarkupChange) {
        return;
      }
      pendingMarkupChange = false;

      /** @type {(controllerTypes.Annotation & {text?: string})[]} */
      const annotations = [...userAnnotations.values()];

      if (state.trailer) {
        const trailerAnnotation = {
          start: state.value.length,
          end: state.value.length,
          name: 'trailer',
          text: '\u200b' + state.trailer,
        };
        annotations.push(trailerAnnotation);
      }

      alignHolderNode.textContent = '';
      alignHolderNode.append(selectionRender.align);

      annotations.forEach((r) => {
        const { align } = renderAnnotation(state.value, r, r.text);
        alignHolderNode.append(align);
      });
    } finally {
      duringContentChangeHint = false;
    }
  });

  contentChangeHint();
  duringDrag(textarea, contentChangeHint);

  textarea.addEventListener('click', () => textarea.focus());
  textarea.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'Escape':
        if (state.selectionStart === state.selectionEnd) {
          const { length } = textarea.value;
          if (state.selectionEnd === length) {
            return;  // do nothing
          }
          textarea.setSelectionRange(length, length);
        } else if (state.selectionDirection === 'backward') {
          textarea.setSelectionRange(state.selectionStart, state.selectionStart);
        } else {
          textarea.setSelectionRange(state.selectionEnd, state.selectionEnd);
        }
        event.preventDefault();
        return;

      case 'Enter':
        // nb. don't preventDefault, users might want to know
        return;

      case ' ':
        if (callbacks.spaceKey?.(buildMeta(event))) {
          event.preventDefault();
        }
        return;
    }

    // Don't try to detect a nav in a bunch of cases.
    if (!selectionRangeElement ||
      !verticalKeys.includes(event.key) ||
      event.shiftKey ||
      !callbacks.nav) {
      return;
    }

    /** @type {-1|1} */
    let dir;

    switch (event.key) {
      case 'ArrowUp':
      case 'Up':
        if (state.selectionStart === 0 || textarea.rows === 1) {
          // hooray, move!
        } else {
          const lineHeight = heightHelperNode.offsetHeight;
          const startLine = Math.round(selectionRangeElement.offsetTop / lineHeight);
          if (startLine !== 0) {
            return;  // nothing to do, not on line=0
          }
        }
        dir = -1;
        break;

      case 'ArrowDown':
      case 'Down':
        if (textarea.rows === 1 || state.selectionStart >= state.value.length) {
          // hooray, move!
        } else {
          const lineHeight = heightHelperNode.offsetHeight;
          const selectionExtent = selectionRangeElement.offsetTop + selectionRangeElement.offsetHeight;
          if (textarea.offsetHeight - lineHeight >= selectionExtent) {
            return;  // not on last line
          }
        }
        dir = +1;
        break;

      default:
        return;  // should never happen
    }

    const metaDir = { dir, ...buildMeta(event) };
    if (callbacks.nav(metaDir)) {
      // If the nav was successful, don't emit the event.
      event.preventDefault();
      event.stopPropagation();
    }

  });

  /**
   * @param {(was: string) => string} handler
   * @param {controllerTypes.Range=} range
   * @return {controllerTypes.Range}
   */
  const replaceWith = (handler, range) => {
    const wasSelection = (!range);
    range = range ?? { start: state.selectionStart, end: state.selectionEnd };

    const previousText = state.value.substr(range.start, range.end - range.start);
    let updatedText = handler(previousText);
    if (!state.multiline) {
      updatedText = updatedText.replace(newlineRegexp, '');
    }

    const expected = state.value.substr(0, range.start) + updatedText + state.value.substr(range.end);

    textarea.focus();
    if (!wasSelection) {
      textarea.setSelectionRange(range.start, range.end);
    }

    // This is deprecated but we need it to support the undo/redo stack.
    if (document.execCommand('insertText', false, updatedText) && textarea.value === expected) {
      // execCommand generates 'input' event, don't dispatch
    } else {
      // execCommand didn't work, is unsupported in HTML form elements (e.g. Firefox)
      textarea.value = expected;
      textarea.dispatchEvent(new Event('change'));
    }
    state.value = expected;

    const updatedRange = {
      start: range.start,
      end: range.start + updatedText.length,
    };

    const updatedSelectionStart = drift(range, updatedText, state.selectionStart);
    const updatedSelectionEnd = drift(range, updatedText, state.selectionEnd);

    state.selectionStart = updatedSelectionStart;
    state.selectionEnd = updatedSelectionEnd;

    textarea.setSelectionRange(updatedSelectionStart, updatedSelectionEnd);

    // TODO: this is subtly different
    if (wasSelection) {
      //      textarea.setSelectionRange(state.selectionStart, updatedText.length + state.selectionStart);
    }

    pendingValueChange = true;
    userAnnotations.clear();

    return updatedRange;
  };

  // If this is a singleline, then rewrites pastes with newline characters.
  textarea.addEventListener('paste', (event) => {
    contentChangeHint(event);
    if (state.multiline) {
      return;
    }

    let paste = event.clipboardData?.getData('text') || '';
    if (!paste.includes('\n')) {
      return;
    }
    event.preventDefault();

    paste = paste.replace(newlineRegexp, ' ');
    replaceWith(() => paste);
  });

  // Non-deduped textInput handler, for space on mobile browsers ('dreaded keycode 229').
  // Note that this will generate multiple events.
  textarea.addEventListener('textInput', (event) => {
    const { data } = /** @type {{data?: string}} */ (event);
    if (data !== ' ') {
      return;
    }

    // TODO: detect on mobile only (fires on desktop too)? merge with real event?
    // if (callbacks.spaceKey?.(buildMeta(event))) {
    //   event.preventDefault();
    // }
  });

  const fragment = document.createDocumentFragment();
  fragment.append(textarea, renderHolderNode, alignHolderNode);

  return {

    fragment,

    set value(v) {
      if (!state.multiline) {
        v = v.replace(newlineRegexp, '');
      }
      state.value = v;
      textarea.value = v;
      textarea.dispatchEvent(new Event('change'));
      pendingValueChange = true;

      // Browsers should set this to the end, but just in case it didn't...
      textarea.setSelectionRange(v.length, v.length);
      state.selectionStart = v.length;
      state.selectionEnd = v.length;

      userAnnotations.clear();
    },

    get value() {
      return state.value;
    },

    get selectionStart() {
      return state.selectionStart;
    },

    get selectionEnd() {
      return state.selectionEnd;
    },

    get selectionDirection() {
      return state.selectionDirection;
    },

    mark(name, range) {
      if (range) {
        const prev = userAnnotations.get(name);
        if (prev && prev.start === range.start && prev.end === range.end) {
          return;
        }

        userAnnotations.set(name, { name: `mark-${name}`, ...range });
      } else if (userAnnotations.has(name)) {
        userAnnotations.delete(name);
      } else {
        return;
      }

      pendingMarkupChange = true;
      if (!duringContentChangeHint) {
        contentChangeHint();
      }
    },

    find(name) {
      const out = userAnnotations.get(name);
      return out ? { ...out } : undefined;
    },

    get multiline() {
      return state.multiline;
    },

    set multiline(v) {
      state.multiline = v;
    },

    get trailer() {
      return state.trailer;
    },

    set trailer(v) {
      if (state.trailer === v) {
        return;
      }
      state.trailer = v;

      pendingTrailerChange = true;
      pendingMarkupChange = true;
      if (!duringContentChangeHint) {
        contentChangeHint();
      }
    },

    get minRows() {
      return state.minRows;
    },

    set minRows(v) {
      if (state.minRows !== v) {
        state.minRows = v;
        viewportChangeHint();
      }
    },

    cursor() {
      const outerRect = textarea.getBoundingClientRect();
      const innerRect = selectionRangeElement.getBoundingClientRect();

      return {
        x: (innerRect.x - outerRect.x) + (innerRect.width / 2),
        y: (innerRect.y - outerRect.y) + (innerRect.height / 2),
      };
    },

    focus() {
      textarea.focus();
    },

    selectAll() {
      textarea.setSelectionRange(0, textarea.value.length);
      contentChangeHint();
    },

    replaceWith,

  };
}


/**
 * @param {string} value
 * @param {controllerTypes.Annotation} annotation
 * @param {string=} text
 * @return {{ align: HTMLDivElement, range: HTMLSpanElement }}
 */
function renderAnnotation(value, { start, end, name }, text) {
  const align = document.createElement('div');
  align.className = 'align text';

  const range = document.createElement('span');
  range.setAttribute('part', name);
  range.textContent = text ?? value.substr(start, end - start);

  align.append(value.substr(0, start), range, value.substr(end));

  return { align, range };
};


/**
 * @param {Node} target
 * @param {string} events
 * @param {(events: Set<string>) => void} handler
 * @return {(event?: Event) => void} manually triggers events
 */
function dedupListener(target, events, handler) {
  let frame = 0;

  /** @type {Set<string>} */
  const seenEvents = new Set();

  /** @type {(event?: Event) => void} */
  const eventHandler = (event) => {
    if (event) {
      seenEvents.add(event.type);
    }

    if (frame) {
      return;
    }
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const copy = new Set(seenEvents);
      seenEvents.clear();
      handler(copy);
    });
  };

  const allEvents = events.split(/\s+/g).filter((x) => x.length);
  const passiveOpt = { passive: true };
  allEvents.forEach((name) => target.addEventListener(name, eventHandler, passiveOpt));

  return eventHandler;
}


/**
 * @param {controllerTypes.Range} range
 * @param {string} text
 * @param {number} where
 */
function drift(range, text, where) {
  if (where >= range.end) {
    where = where - (range.end - range.start) + text.length;  // after
  } else if (where <= range.start + text.length) {
    // during, retain
  } else {
    where = range.start + text.length;  // during but after length, go to end
  }
  return where;
}


/**
 * Sets up a handler that is continually invoked as a user drags their cursor around a single
 * element, using the Pointer Events API.
 *
 * @param {Element} target
 * @param {() => void} handler
 */
function duringDrag(target, handler) {

  /** @type {(rawEvent: Event) => void} */
  const pointerMoveHandler = (rawEvent) => {
    const event = /** @type {PointerEvent} */ (rawEvent);

    if (event.pressure === 0) {
      target.removeEventListener('pointermove', pointerMoveHandler);
    } else {
      handler();
    }
  };

  target.addEventListener('pointerdown', (rawEvent) => {
    const event = /** @type {PointerEvent} */ (rawEvent);

    target.setPointerCapture(event.pointerId);
    target.addEventListener('pointermove', pointerMoveHandler);
  });

}


/**
 * @param {Event} event
 * @return {controllerTypes.Meta}
 */
function buildMeta(event) {
  if (event instanceof KeyboardEvent) {
    return {
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
    };
  }
  return { shiftKey: false, metaKey: false, ctrlKey: false, altKey: false };
}
