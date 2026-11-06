// Sidebar building blocks shared by the shell and its slot owners (favorites,
// workspaces), so every row has the same density, focus ring and active logic.
//
// Exports:
//   sidebarRowClass, isActivePath   (plain values, this module)
//   SidebarLink, SidebarSection     (components: sidebar-link.svelte, sidebar-section.svelte)
//   import { SidebarLink, sidebarRowClass } from '@/lib/components/app-shell/sidebar-nav';

export { isActivePath, sidebarRowClass } from './sidebar-row';

export { default as SidebarLink } from './sidebar-link.svelte';
export type { SidebarLinkProps } from './sidebar-link.svelte';
export { default as SidebarSection } from './sidebar-section.svelte';
export type { SidebarSectionProps } from './sidebar-section.svelte';
