/*
 * Port of src/components/ui/tabs.tsx (Radix Tabs → bits-ui Tabs).
 *
 * Caller translation:
 * - `<Tabs defaultValue="csv">` and `<Tabs value={tab} onValueChange={fn}>` keep working;
 *   `bind:value={tab}` also works. `className` → `class`.
 * - Strict control (ignore values the parent rejects):
 *   `bind:value={() => tab, (v) => isTab(v) && setTab(v)}`.
 * - `<TabsList variant="line">` and `tabsListVariants({ variant })` are unchanged.
 * - `asChild` on any part → `{#snippet child({ props })}<el {...props} />{/snippet}`.
 * - Styling: triggers get `data-state="active|inactive"` (the `data-active:` variant matches it) and
 *   `data-orientation`, like Radix. Inactive TabsContent is unmounted, like Radix without forceMount.
 */
import Root from './tabs.svelte';
import List, { tabsListVariants, type TabsListVariant, type TabsListVariants } from './tabs-list.svelte';
import Trigger from './tabs-trigger.svelte';
import Content from './tabs-content.svelte';

export {
  Root as Tabs,
  List as TabsList,
  Trigger as TabsTrigger,
  Content as TabsContent,
  tabsListVariants,
  type TabsListVariant,
  type TabsListVariants,
};
