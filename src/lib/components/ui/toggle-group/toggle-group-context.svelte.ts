import { createContext } from 'svelte';
import type { ToggleVariants } from '@/lib/components/ui/toggle';

/** Same shape as the React `ToggleGroupContext` value. */
export type ToggleGroupContextValue = ToggleVariants & {
  spacing?: number;
  orientation?: 'horizontal' | 'vertical';
};

/** React's `createContext(...)` default, used when an item has no ToggleGroup ancestor. */
const DEFAULT_CONTEXT: ToggleGroupContextValue = {
  size: 'default',
  variant: 'default',
  spacing: 2,
  orientation: 'horizontal',
};

const [getContext, setContext, hasContext] = createContext<ToggleGroupContextValue>();

/**
 * Called by ToggleGroup during init. Pass an object with getters so items see
 * prop changes (`{ get variant() { return variant } , … }`).
 */
export function setToggleGroupContext(value: ToggleGroupContextValue): ToggleGroupContextValue {
  return setContext(value);
}

/** `React.useContext(ToggleGroupContext)`: the nearest group's values, or the React default. */
export function getToggleGroupContext(): ToggleGroupContextValue {
  return hasContext() ? getContext() : DEFAULT_CONTEXT;
}
