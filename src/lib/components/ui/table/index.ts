/*
 * Port of src/components/ui/table.tsx (plain table elements).
 *
 * Caller translation: same part names and classes; `className` → `class`, `colSpan` → `colspan`,
 * `ref` → `bind:ref` (on Table the ref is the <table>, inside the scroll container as in React).
 * Row selection styling still uses `data-state="selected"` on TableRow.
 */
import Root from './table.svelte';
import Header from './table-header.svelte';
import Body from './table-body.svelte';
import Footer from './table-footer.svelte';
import Head from './table-head.svelte';
import Row from './table-row.svelte';
import Cell from './table-cell.svelte';
import Caption from './table-caption.svelte';

export {
  Root as Table,
  Header as TableHeader,
  Body as TableBody,
  Footer as TableFooter,
  Head as TableHead,
  Row as TableRow,
  Cell as TableCell,
  Caption as TableCaption,
};
