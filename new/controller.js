
import * as controllerTypes from './types/controller.js';


export const eventNames = Object.seal({
  select: '-advanced-select',
  nav: '-advanced-nav',
});


const verticalKeys = ['ArrowUp', 'Up', 'ArrowDown', 'Down'];


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

  // There's always a selection, but we steal it after the 1st render.
  let selectionElement = document.createElement('span');

  const heightHelperNode = document.createElement('span');
  heightHelperNode.toggleAttribute('aria-hidden', true);
  heightHelperNode.style.display = 'inline-block';  // needed to correctly compare to textarea height
  heightHelperNode.textContent = '\u200b';

  const state = {
    value: '',
    selectionStart: -1,  // start with always invalid value
    selectionEnd: 0,
    /** @type {typeof HTMLTextAreaElement.prototype.selectionDirection} */
    selectionDirection: 'none',
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

  const contentEvents = 'change keydown keypress input value select click contextmenu mousedown touchstart';
  const contentChangeHint = dedupListener(textarea, contentEvents, (events) => {
    const valueChange = (state.value !== textarea.value);
    const selectionChange = (state.selectionStart !== textarea.selectionStart ||
      state.selectionEnd !== textarea.selectionEnd);
    const anyChange = valueChange || selectionChange;

    if (!anyChange) {
      return;
    }
    if (valueChange) {
      renderNode.textContent = textarea.value;
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

    // write `data-selection` to element
    if (rangeSelection) {
      const value = state.value.substring(state.selectionStart, state.selectionEnd);
      // input.setAttribute('data-selection', value);
    } else {
      // input.removeAttribute('data-selection');
    }

    const low = Math.min(state.selectionStart, state.selectionEnd);
    const high = Math.max(state.selectionStart, state.selectionEnd);

    const annotations = [
      {
        start: low,
        length: high - low,
        part: 'selected',
      },
    ];

    alignHolderNode.textContent = '';
    const annotationEls = annotations.map(({start, length, part}) => {
      const align = document.createElement('div');
      align.className = 'align text';
      align.textContent = state.value.substr(0, start);  // include trailing space

      const span = document.createElement('span');
      span.setAttribute('part', part);

      if (length) {
        span.textContent = state.value.substr(start, length);
      } else {
        span.textContent = '\u200b';
      }

      align.appendChild(span);

      // TODO: why do we do this?
      if (false && length) {
        const rest = document.createTextNode(state.value.substr(start + length));
        align.appendChild(rest);
      }

      alignHolderNode.append(align);

      return span;
    });
    selectionElement = annotationEls[0];

    // something changed, and the value may have changed: clients should do markup again
    callbacks.update?.(valueChange);
  });

  contentChangeHint();
  duringDrag(textarea, contentChangeHint);

  textarea.addEventListener('click', () => textarea.focus());
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
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
    }

    // Don't try to detect a nav in a bunch of cases: shift for selection, or already have selection.
    if (!verticalKeys.includes(event.key) || event.shiftKey || state.selectionStart !== state.selectionEnd) {
      return;
    }

    switch (event.key) {
      case 'ArrowUp':
      case 'Up':
        if (state.selectionStart === 0 || textarea.rows === 1) {
          // hooray, move!
        } else {
          const lineHeight = heightHelperNode.offsetHeight;
          const startLine = Math.round(selectionElement.offsetTop / lineHeight);
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
          if (textarea.offsetHeight - lineHeight >= selectionElement.offsetTop + selectionElement.offsetHeight) {
            return;  // not on last line
          }
        }
        if (callbacks.nav?.(+1)) {
          event.preventDefault();
        }
        break;
    }
  });

  const fragment = document.createDocumentFragment();
  fragment.append(textarea, renderNode, alignHolderNode);

  return {

    fragment,

    set value(v) {
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
    }

  };
}


/**
 * @param {Node} target
 * @param {string} events
 * @param {(events: Set<string>) => void} handler
 * @return {() => void} manually triggers events
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
  allEvents.forEach((name) => target.addEventListener(name, eventHandler, { passive: true }));

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
