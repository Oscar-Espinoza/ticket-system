import { pluralize } from '@/lib/format';
export const issuesLabel = (count: number) => `${pluralize(count, 'issue')}`;
