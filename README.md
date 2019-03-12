Library which augments a `<textarea>` or `<input>` element to enable autocomplete, custom annotations/markup, and retaining user selection even without foucs.

This is ideal for "hero" inputs: e.g., a primary search box, composing email, or entering a chat message.
As seen [on Twitter](https://twitter.com/samthor/status/1101283110186967042).

🚨 **This is unpolished** and should only be used for experiments!
[Try the demo](https://samthor.github.io/advanced-input/demo/)!

## Usage

You can use `advanced-input` as a Web Component, which is preferred, but you'll need a browser (or polyfill) that supports CE's and Shadow DOM.
Read more about those features on [Custom Elements Everywhere](https://custom-elements-everywhere.com/).

Install on Yarn/NPM via `advanced-input`.

### Web Component

The Web Component version is somewhat opinionated and describes its own styling and annotates words under your cursor with a subtle highlight (as per the Twitter demo above).

Add the dependency to your JS and register it as a CE:

```js
import AdvancedInputElement from './node_modules/advanced-input/element.js';
customElements.define('advanced-input', AdvancedInputElement);
```

Then add the element to your page, optionally adding the `multiple` attribute for a multiline text input:

```html
<advanced-input multiple value="Hello" suggest="Hello There"></advanced-input>
```

### Low-Level JavaScript

The pure-JS version does not require Web Components or Shadow DOM.
It 'upgrades' an existing `<textarea>` or `<input>` by changing its behavior and rendering a copy, with additional annotations, into a target element.

You configure it with JS:

```js
import * as advancedInput from './node_modules/advanced-input/index.js';

const controller = advancedInput.upgrade(inputElement, renderTargetElement);

input.addEventListener(advancedInput.event.select, (ev) => {
  // input.selectionStart, input.selectionEnd or input.value has changed
});

// set the value to a string, and replace part of it (uses execCommand, so the user can Undo)
input.value = 'Hello there';
controller.replace(', Sam', {start: 5, end: 11});
```

The rendered copy can be used to pretend as if the real HTML input element is more detailed than it actually is.
For example, an input element with the word "example" selected will render like this:

```html
<div class="holder" style="position: relative">
  <input type="text" value="Some example, hello" />
  <div class="render" style="transform: translate(0px)">
    <div class="_align">
      Some <span class="selected">example</span>
    </div>
    Some example, hello
  </div>
</div>
```

By positioning the rendered copy of the text at exactly the same location as the `<input>` element (and by using the same styles), we can use the annotations created with the `"_align"` class to, e.g., create a unique selection effect.

Similarly, any autocomplete suggestion will be rendered like this:

```html
<div class="render" style="transform: translate(0px)">
  <div class="_align">
    <!-- empty selected as cursor is still placed here -->
    Hello <span class="selected"></span>
  </div>
  Hello 
  <span class="autocomplete">there</span>
</div>
```

The minimum CSS to ensure this works [in the example CSS file](example.css).

## Notes

* While the advanced input retains the user's previous selection, you must ensure the element is focused before changing it yourself, e.g.:

```js
    input.focus();  // required, or selection might fail
    input.setSelectionRange(0, 3);
```

* EdgeHTML and IE don't set the `.scrollLeft` property of `<input>`, so long inputs may not render correctly in these browsers.
There's various workarounds but the solution might be to use a "single-line" `<textarea>` with a handler that replaces newlines.

## TODOs

* Not all events are documented yet
* This library generates a lot of nodes, which at least should be annotated with `aria-hidden` so they're not read by screen readers
