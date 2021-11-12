
export interface AdvancedInputController {

  readonly fragment: DocumentFragment;

  value: string;

  trailer: string;

  minRows: number;

  readonly selectionStart: number;
  readonly selectionEnd: number;
  // readonly selectionStartLine: number;
  // readonly selectionEndLine: number;
  readonly selectionDirection: typeof HTMLTextAreaElement.prototype.selectionDirection;

  mark(name: string, annotation?: {start: number, end: number}): void;

  multiline: boolean;

  replaceWith(handler: (was: string) => string, range?: { start: number, end: number }): void;

  cursor(): {x: number, y: number};

  focus(): void;

}


export interface Annotation {
  start: number;
  end: number;
  name: string;
}


export interface Meta {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}


export interface MetaDir extends Meta {
  dir: -1|1;
}


export interface AdvancedInputCallbacks {
  update(change: boolean): void;
  nav(metaDir: MetaDir): boolean;
  spaceKey(meta: Meta): boolean;
}

