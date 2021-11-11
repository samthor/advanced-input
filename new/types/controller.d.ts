
export interface AdvancedInputController {

  readonly fragment: DocumentFragment;

  value: string;

  readonly selectionStart: number;
  readonly selectionEnd: number;
  // readonly selectionStartLine: number;
  // readonly selectionEndLine: number;
  readonly selectionDirection: typeof HTMLTextAreaElement.prototype.selectionDirection;

}


export interface AdvancedInputCallbacks {
  nav(dir: -1|1): boolean;
  update(change: boolean): void;
}