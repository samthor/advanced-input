
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

  const renderNode = document.createElement('div');
  renderNode.className = 'text sizer';

  const alignHolderNode = document.createElement('div');

  /** @type {HTMLSpanElement?} */
  let selectionRangeElement = null;

  const heightHelperNode = document.createElement('span');
  heightHelperNode.toggleAttribute('aria-hidden', true);
  heightHelperNode.style.display = 'inline-block';  // needed to correctly compare to textarea height
  heightHelperNode.textContent = '\u200b';

  /** @type {Map<string, controllerTypes.Annotation>} */
  const userAnnotations = new Map();

  const state = {
    value: '',
    selectionStart: -1,  // start with always invalid value
    selectionEnd: 0,
    /** @type {typeof HTMLTextAreaElement.prototype.selectionDirection} */
    selectionDirection: 'none',

    multiline: false,
  };

  const viewportChangeHint = () => {
    renderNode.append(heightHelperNode);  // nb. render now includes autocomplete

    // We need the floating-point height here in case the browser is zoomed.
    // Don't bother with the renderNode, as it tends to get large enough not to matter: just round
    // to avoid off-by-one errors.
    const lineHeight = heightHelperNode.getBoundingClientRect().height;
    const renderLines = Math.max(1, Math.round(renderNode.offsetHeight / lineHeight));
    textarea.rows = renderLines;
  };

  // If the textarea changes size (left/right), the number of rows it needs will change.
  const ro = new ResizeObserver(viewportChangeHint);
  ro.observe(textarea);

  let duringContentChangeHint = false;
  let pendingMarkupChange = false;

  const contentEvents = 'change keydown keypress input value select click contextmenu mousedown touchstart';
  const contentChangeHint = dedupListener(textarea, contentEvents, (events) => {
    duringContentChangeHint = true;
    try {
      const valueChange = (state.value !== textarea.value);
      const selectionChange = (state.selectionStart !== textarea.selectionStart ||
        state.selectionEnd !== textarea.selectionEnd);
      const anyChange = valueChange || selectionChange || pendingMarkupChange;

      if (!anyChange) {
        return;
      }
      if (valueChange) {
        if (!state.multiline) {
          const v = textarea.value.replace(newlineRegexp, ' ');
          if (v !== textarea.value) {
            // TODO: We don't "fix" bad input right now, because it kills the undo/redo stack.
          }
        }
        renderNode.textContent = textarea.value;
        viewportChangeHint();
        userAnnotations.clear();
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

      // Something changed, and the value may have changed. Clients can do markup again here.
      // Nothing visible on the controller is changed below (public visible state), we just
      // reconcile the underlying <textarea> after this.
      callbacks.update?.(valueChange);

      const low = Math.min(state.selectionStart, state.selectionEnd);
      const high = Math.max(state.selectionStart, state.selectionEnd);

      const selectionAnnotation = {
        start: low,
        end: high,
        name: 'selected',
      };
      const selectionRender = renderAnnotation(state.value, selectionAnnotation);

      if (valueChange || pendingMarkupChange) {
        const annotations = [...userAnnotations.values()];

        alignHolderNode.textContent = '';
        alignHolderNode.append(selectionRender.align);

        annotations.forEach((annotation) => {
          const { align } = renderAnnotation(state.value, annotation);
          alignHolderNode.append(align);
        });
        pendingMarkupChange = false;

      } else {
        // We can just re-render things that are effected by cursor moves.
        selectionRangeElement?.parentElement?.replaceWith(selectionRender.align);
      }

      selectionRangeElement = selectionRender.range;
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
        if (!state.multiline) {
          event.preventDefault();
        }
        return;
    }

    // Don't try to detect a nav in a bunch of cases: shift for selection, or already have selection.
    if (!selectionRangeElement ||
      !verticalKeys.includes(event.key) ||
      event.shiftKey ||
      state.selectionStart !== state.selectionEnd) {
      return;
    }

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
        if (callbacks.nav?.(-1)) {
          event.preventDefault();
        }
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
        if (callbacks.nav?.(+1)) {
          event.preventDefault();
        }
        break;
    }
  });

  /**
   * @param {(was: string) => string} handler
   * @param {{start: number, end: number}=} range
   */
  const replaceWith = (handler, range) => {
    const wasSelection = (!range);
    range = range ?? { start: state.selectionStart, end: state.selectionEnd }; 

    const previousText = state.value.substr(range.start, range.end - range.start);
    const updatedText = handler(previousText);
    const expected = state.value.substr(0, range.start) + updatedText + state.value.substr(range.end);

    textarea.focus();
    if (!wasSelection) {
      textarea.setSelectionRange(range.start, range.end);
    }

    if (document.execCommand('insertText', false, updatedText) && textarea.value === expected) {
      // execCommand generates 'input' event, don't dispatch
    } else {
      // execCommand didn't work, is unsupported in HTML form elements (e.g. Firefox)
      textarea.value = expected;
      textarea.dispatchEvent(new CustomEvent('change'));
    }

    // TODO: restore cursor?
  }

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

  const fragment = document.createDocumentFragment();
  fragment.append(textarea, renderNode, alignHolderNode);

  return {

    fragment,

    set value(v) {
      if (!state.multiline) {
        v = v.replace(newlineRegexp, '');
      }
      textarea.value = v;
    },

    get value() {
      return textarea.value;
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

    mark(name, annotation) {
      if (name === 'selection') {
        throw new Error(`can't update 'selection'`);
      }

      if (annotation) {
        userAnnotations.set(name, { name, ...annotation });
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

    get multiline() {
      return state.multiline;
    },

    set multiline(v) {
      state.multiline = v;
    },

    replaceWith,

  };
}


/**
 * @param {string} value
 * @param {controllerTypes.Annotation} annotation
 * @return {{ align: HTMLDivElement, range: HTMLSpanElement }}
 */
function renderAnnotation(value, { start, end, name }) {
  const align = document.createElement('div');
  align.className = 'align text';
  align.textContent = value.substr(0, start);  // include trailing space

  const range = document.createElement('span');
  range.setAttribute('part', name);
  range.textContent = value.substr(start, end - start) + '\u200b';
  align.appendChild(range);

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
    seenEvents.add(event?.type ?? '');

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
