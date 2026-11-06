// Limits on a project label's text. Client-safe: the label form's maxlength and
// the label / import actions' validation read the same numbers.

export const LABEL_NAME_MAX = 40;
export const LABEL_DESCRIPTION_MAX = 200;

/** Swatches offered for new labels (Linear-ish defaults). */
export const LABEL_COLORS = [
  '#5e6ad2',
  '#26b5ce',
  '#4cb782',
  '#f2c94c',
  '#f2994a',
  '#eb5757',
  '#bb87fc',
  '#95a2b3',
];
