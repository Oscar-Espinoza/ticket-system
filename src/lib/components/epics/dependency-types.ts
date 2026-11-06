import type { EpicStatus } from '@/lib/epic-model';

export interface DependencyCandidate {
  id: string;
  name: string;
  color: string | null;
  status: EpicStatus;
}
