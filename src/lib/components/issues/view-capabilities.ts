/** What the Display menu offers for a layout; every view in the registry declares one. */
export interface ViewCapabilities {
  /** Grouping, "Show empty groups". */
  grouped: boolean;
  /** Second grouping level (labelled "Swimlanes" on the board). */
  subGrouping: boolean;
  /** The sub-grouping is swimlanes, with columns always shown. */
  swimlanes: boolean;
  /** Ordering control. */
  ordered: boolean;
  /** Display-property toggles. */
  displayProperties: boolean;
}

/** A layout the registry doesn't know: ordering and property toggles only. */
export const UNKNOWN_VIEW_CAPABILITIES: ViewCapabilities = {
  grouped: false,
  subGrouping: false,
  swimlanes: false,
  ordered: true,
  displayProperties: true,
};
