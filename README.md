Library which provides the `<advanced-input>` Web Component, to enable autocomplete, custom annotations/markup, and retaining user selection even without foucs.

This is ideal for "hero" inputs: e.g., a primary search box, composing email, or entering a chat message.
As seen [on Twitter](https://twitter.com/samthor/status/1101283110186967042).

🚨 **This is unpolished** and should only be used for experiments!
[Try the demo](https://samthor.github.io/advanced-input/demo/)!

## Usage

Install on Yarn/NPM via `advanced-input`.

The Web Component is somewhat opinionated and describes its own styling and annotates words under your cursor with a subtle highlight (as per the Twitter demo above).

Add the dependency to your JS and register it as a CE:

```js
import * as advancedInput from 'advanced-input';
const ai = /** @type {advancedInput.AdvancedInputElement} */ (document.createElement('advanced-input'));
```

Then add the element to your page, optionally adding the `multiline` attribute for a multiline text input:

```html
<advanced-input multiline value="Hello" suggest=" There"></advanced-input>
```

The CE emits a number of events, whose names are under `advancedInput.eventNames`:

* `change` when the user types something
* `select` when the user's selection changes
* `nav` when the user attempts to go up/down from the contents
* `spaceKey` when the user presses space
