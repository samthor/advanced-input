
const passiveOption = {passive: true};

/**
 * Dedups the given events into the next rAF.
 *
 * @param {!Node} target to attach handlers to
 * @param {!IArrayLike<string>|string} events to dedup
 * @param {function(!Set<string>): void} handler to run in rAF
 * @return {function(): void} to manually trigger on upcoming rAF
 */
export const dedup = (target, events, handler) => {
  if (typeof events === 'string') {
    events = events.split(/\s+/).filter(Boolean);
  }

  let active = false;
  const seenEvents = new Set();
  let frame = 0;
  const eventHandler = (ev) => {
    if (active && !ev) {
      return;  // do nothing
    }
    if (!frame) {
      seenEvents.clear();
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        active = true;
        try {
          handler(seenEvents);
        } finally {
          active = false;
        }
      });
    }

    seenEvents.add(ev ? ev.type : null);
  };

  events.forEach((eventName) => {
    target.addEventListener(eventName, eventHandler, passiveOption);
  });

  return () => eventHandler(null);
};


// Preferrably use 'buttons', but not available in IE11?
const buttonHeld =
    ('buttons' in MouseEvent.prototype ? (ev) => ev.buttons : (ev) => ev.which);


/**
 * Builds a basic drag handler, which when passed a drag-starting event, tracks
 * it until it is complete (touch or mouse).
 *
 * @param {!Node} target to attach handlers to
 * @param {function(): void} fn to be called while being dragged
 * @return {function(): void} to remove handlers
 */
export const drag = (target, fn) => {
  const touchmoveHandler = () => fn();
  const endHandler = (ev) => {
    if (ev.type === 'mousemove' && buttonHeld(ev)) {
      fn();  // only for mousemove event
    } else {
      document.removeEventListener('mousemove', endHandler);
      document.removeEventListener('touchend', endHandler);
      document.removeEventListener('touchmove', touchmoveHandler);
    }
  };

  const startHandler = (ev) => {
    if (ev.type === 'mousedown') {
      document.addEventListener('mousemove', endHandler);
    } else if (ev.type === 'touchstart') {
      document.addEventListener('touchend', endHandler);
      document.addEventListener('touchmove', touchmoveHandler);
    }
  };

  target.addEventListener('mousedown', startHandler, passiveOption);
  target.addEventListener('touchstart', startHandler, passiveOption);
  return () => {
    target.removeEventListener('mousedown', startHandler, passiveOption);
    target.removeEventListener('touchstart', startHandler, passiveOption);
  };
};


/**
 * Configures a function to run after kicked off, every rAF, until the passed
 * method returns a falsey result.
 *
 * @param {function(): (boolean|*)} fn to run every frame until false
 * @return {function(boolean): void} kick off checker if not running
 */
export const checker = (fn) => {
  let rAF = 0;
  let count = 0;

  const frameHandler = () => {
    if (fn(count++)) {
      // run again next frame
      rAF = window.requestAnimationFrame(frameHandler);
    } else {
      rAF = 0;
    }
  };

  const ret = (insideFrame) => {
    count = 0;
    if (rAF) {
      // nothing to do, we were scheduled even if this is a rAF
    } else if (insideFrame) {
      // caller believes we're inside a rAF itself, just invoke
      frameHandler();
    } else {
      // enqueue for next frame
      // TODO(samthor): Safari and others don't respect the rAF draw rules, so
      // they might be off by a frame.
      rAF = window.requestAnimationFrame(frameHandler);
    }
  };
  ret();  // trigger normal behavior immediately
  return ret;
};


export const isActive = (target) => {
  const root = (target.getRootNode ? target.getRootNode() : document);
  return root.activeElement === target;
};

const hasFocusRootNode = (el) => el.getRootNode().activeElement === el;
const hasFocusSimple = (el) => document.activeElement === el;

export const hasFocus = (Node.prototype.getRootNode ? hasFocusRootNode : hasFocusSimple);
