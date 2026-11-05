/*
 * Port of src/components/ui/textarea.tsx (plain <textarea>).
 *
 * Caller translation:
 * - `value={x} onChange={(e) => setX(e.target.value)}` → `bind:value={x}` (or
 *   `value={x} oninput={(e) => (x = e.currentTarget.value)}`; React's onChange fires per keystroke,
 *   which is `oninput` in Svelte — `onchange` only fires on blur).
 * - Uncontrolled form fields: `name="bio" defaultValue={bio}` → `name="bio" value={bio}` (or
 *   `defaultValue={bio}`, which Svelte also supports and which restores on form reset).
 * - `onKeyDown`/`onBlur` → `onkeydown`/`onblur`; `autoFocus` → `autofocus`; `readOnly` →
 *   `readonly`; `maxLength` → `maxlength`; `spellCheck` → `spellcheck`; `className` → `class`;
 *   `ref` → `bind:ref`.
 */
import Root from './textarea.svelte';

export { Root as Textarea };
