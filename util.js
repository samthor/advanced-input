
/**
 * Dedups the given events into the next rAF.
 *
 * @param {!Node} target 
 * @param {!IArrayLike<string>|string} events 
 * @param {function(!Set<string>): void} handler 
 */
export const dedup = (target, events, handler) => {
  if (typeof events === 'string') {
    events = events.split(/\s+/).filter(Boolean);
  }

  const seenEvents = new Set();
  let frame = 0;
  const eventHandler = (ev) => {
    if (ev instanceof CustomEvent) {
      return;  // ignore our own events
    }
    if (!frame) {
      seenEvents.clear();
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        handler(seenEvents);
      });
    }
    if (ev) {
      seenEvents.add(ev.type);
    }
  };

  events.forEach((eventName) => {
    target.addEventListener(eventName, eventHandler, {passive: true});
  });

  return (type) => eventHandler(type ? {type} : null);
};


// Preferrably use 'buttons', but not available in IE11?
const buttonHeld =
    ('buttons' in MouseEvent.prototype ? (ev) => ev.buttons : (ev) => ev.which);


/**
 * Builds a basic drag handler, which when passed a drag-starting event, tracks
 * it until it is complete (touch or mouse).
 *
 * @param {!Element} el to attach handlers to
 * @param {function(): void} fn to be called while being dragged
 * @return {function(): void} to remove handlers
 */
export const drag = (el, fn) => {
  const touchmoveHandler = (ev) => fn();
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

  el.addEventListener('mousedown', startHandler);
  el.addEventListener('touchstart', startHandler);
  return () => {
    el.removeEventListener('mousedown', startHandler);
    el.removeEventListener('touchstart', startHandler);
  };
};


/**
 * Configures a function to run after kicked off, every rAF, until the passed
 * method returns a falsey result.
 *
 * @param {function(): (boolean|*)} fn to run every frame until false
 * @return {function(): void} kick off checker if not running
 */
export const checker = (fn) => {
  let rAF = 0;

  const checkerHandler = () => {
    if (fn()) {
      // run again next frame
      rAF = window.requestAnimationFrame(checkerHandler);
    } else {
      rAF = 0;
    }
  };

  checkerHandler();  // start immediately

  return () => {
    // kicks off checker
    if (!rAF) {
      // nb. Running this on a frame boundary makes Chrome happy.
      // TODO(samthor): Safari and others don't respect the rAF draw rules, so
      // they might be off by a frame.
      rAF = window.requestAnimationFrame(checkerHandler);
    }
  };
};


/**
 * Simple controller that tracks events which can be enabled or disabled.
 */
export class EventController {
  constructor(enabled = true) {
    this._all = [];
    this._enabled = true;
  }

  add(target, type, fn, opts) {
    this._all.push({target, type, fn, opts});
    if (this._enabled) {
      target.addEventListener(type, fn, opts);
    }
  }

  enable() {
    this._all.forEach(({target, type, fn, opts}) => target.addEventListener(type, fn, opts));
  }

  disable() {
    this._all.forEach(({target, type, fn, opts}) => target.removeEventListener(type, fn, opts));
  }
}
