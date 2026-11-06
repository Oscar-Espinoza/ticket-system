const DAY_PREFIX = 'day:';

export const NO_DATE = 'no-date';

export const dayDropId = (date: string) => `${DAY_PREFIX}${date}`;

/** The due date a drop target stands for; null for the "no date" sidebar. */
export const dateOfDropId = (id: string) => (id === NO_DATE ? null : id.slice(DAY_PREFIX.length));
