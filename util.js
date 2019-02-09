
/**
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


/**
 * @param {function(): void} fn to run while mouse held 
 * @return {function(): void} to kick off on mousedown
 */
const mousedown = (fn) => {
  const handler = (ev) => {
    if (!ev.which) {
      document.removeEventListener('mousemove', handler);
    } else {
      fn();
    }
  };

  return () => {
    document.addEventListener('mousemove', handler);
  };
};

const touchstart = (fn) => {
  const endHandler = (ev) => {
    // TODO(samthor): What if there was multiple touches? Just testing in emulator.
    document.removeEventListener('touchend', endHandler);
    document.removeEventListener('touchmove', moveHandler);
  };
  const moveHandler = (ev) => fn();

  return () => {
    document.addEventListener('touchend', endHandler);
    document.addEventListener('touchmove', moveHandler);
  };
}

export const drag = (fn) => {
  // TODO(samthor): This conceptually is the same thing but is really just two handlers
  // under the hood. Is there any benefit to unioning? Pointer Events?
  const mouse = mousedown(fn);
  const touch = touchstart(fn);

  return (ev) => {
    const start = ev.type.substr(0, 5);
    if (start === 'mouse') {
      return mouse();
    } else if (start === 'touch') {
      return touch();
    }
    throw new Error('bad event type: ' + ev.type);
  };
};


/**
 * @param {function(): boolean} fn to run every frame until false
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
