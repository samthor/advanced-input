
export interface AdvancedInputController {

  readonly fragment: DocumentFragment;

  /**
   * The current value of this controller. User changes are detected in a `requestAnimationFrame`
   * call, so it may be behind user-visible changes.
   *
   * Setting this value clears all annotations immediately.
   */
  value: string;

  trailer: string;

  minRows: number;

  readonly selectionStart: number;
  readonly selectionEnd: number;
  // readonly selectionStartLine: number;
  // readonly selectionEndLine: number;
  readonly selectionDirection: typeof HTMLTextAreaElement.prototype.selectionDirection;

  mark(name: string, annotation?: Range): void;
  find(name: string): Range | undefined;

  multiline: boolean;

  /**
   * Replaces the currently selected range (or the passed range) with an updated value. The handler
   * is passed the previous value that is being replaced.
   *
   * This clears all annotations immediately.
   */
  replaceWith(handler: (was: string) => string, range?: Range): Range;

  cursor(): { x: number, y: number };

  focus(): void;

  selectAll(): void;

}

export interface Range {
  start: number;
  end: number;
}


export interface Annotation extends Range {
  name: string;
}


export interface Meta {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}


export interface MetaDir extends Meta {
  dir: -1 | 1;
}


export interface AdvancedInputCallbacks {
  update(change: boolean): void;
  nav(metaDir: MetaDir): boolean;
  spaceKey(meta: Meta): boolean;
}

