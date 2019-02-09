/**
 * @fileoverview Non-WC entrypoint to advanced-input. Upgrades an input and
 * renders to another.
 */

import * as util from './util.js';

/*
 * This looks for three classes of events:
 *
 *   1. Change events. e.g., `change`, `keydown`: to rerender text
 *   2. Focus events. e.g., `focus`, `mousedown`: to fix scroll left, announce cursor
 *   3. Viewport events. e.g., `scroll`: to align preview
 */

const dedupEvents =
    'change keydown keypress click mousedown touchstart select input blur focus scroll';

export const upgrade = (input, target) => {
  const state = {
    scrollLeft: input.scrollLeft,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
    selectionDirection: input.selectionDirection,
  };

  const viewportChangeHint = (() => {
    let framesOk = 0;
    const checkForFrames = 10;  // run for this many frames after last change

    return util.checker(() => {
      state.scrollLeft = input.scrollLeft;

      const style = `translate(${-input.scrollLeft}px)`;
      if (style !== target.style.transform) {
        framesOk = 0;
        target.style.transform = style;
        return true;
      }
      return ++framesOk < checkForFrames;
    });
  })();

  // Handle left/right scroll on input.
  input.addEventListener('wheel', viewportChangeHint, {passive: true});

  // If a user is click or touch-dragging, this is changing the input selection and scroll.
  const drag = util.drag(viewportChangeHint);
  input.addEventListener('mousedown', drag);
  input.addEventListener('touchstart', drag);

  const contentEvents = 'change keydown keypress input value';
  const contentChangeHint = util.dedup(input, contentEvents, (events) => {
    target.textContent = input.value;
    console.info('got hint', events, input.value);

    state.selectionStart = input.selectionStart;
    state.selectionEnd = input.selectionEnd;
    state.selectionDirection = input.selectionDirection;

    viewportChangeHint();
  });

  const focusEvents = 'click mousedown touchstart select blur focus';
  const focusChangeHint = util.dedup(input, focusEvents, (events) => {
    // Browsers reset scrollLeft when we navigate away from the input, but we can just tell it to
    // go back to what it was.
    if (events.has('blur')) {
      input.scrollLeft = state.scrollLeft;
    } else if (events.has('mousedown') || events.has('touchstart')) {
      // do nothing: user clicked to select
    } else if (events.has('focus')) {
      input.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
      input.scrollLeft = state.scrollLeft;  // Safari also reset on focus
    } else {
      // TODO(samthor): work out if 'click' or 'select' were useful?
      console.info('got useless', events);
    }
  });

  // Chrome mobile needs `selectionchange` to handle a long-press select.
  document.addEventListener('selectionchange', (ev) => {
    if (document.activeElement === input) {
      contentChangeHint('selectionchange');
    }
  });
};
