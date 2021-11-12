
export interface AdvancedInputController {

  readonly fragment: DocumentFragment;

  value: string;

  trailer: string;

  placeholder: string;

  readonly selectionStart: number;
  readonly selectionEnd: number;
  // readonly selectionStartLine: number;
  // readonly selectionEndLine: number;
  readonly selectionDirection: typeof HTMLTextAreaElement.prototype.selectionDirection;

  mark(name: string, annotation?: {start: number, end: number}): void;

  multiline: boolean;

  replaceWith(handler: (was: string) => string, range?: { start: number, end: number }): void;

}


export interface Annotation {
  start: number,
  end: number,
  name: string,
}


export interface Meta {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}


export interface AdvancedInputCallbacks {
  nav(dir: -1|1, meta: Meta): boolean;
  update(change: boolean): void;
  spaceKey(meta: Meta): boolean;
}
