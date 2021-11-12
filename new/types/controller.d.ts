
export interface AdvancedInputController {

  readonly fragment: DocumentFragment;

  value: string;

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


export interface AdvancedInputCallbacks {
  nav(dir: -1|1): boolean;
  update(change: boolean): void;
}