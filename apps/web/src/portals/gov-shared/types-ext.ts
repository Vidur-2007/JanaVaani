// Laptop C: extra contract types added during isolation go here (moved to packages/contracts at the H30 merge).
import type { DemoClock } from '@contracts/types';

/** What #30 accepts for a delay: B's StatusIn takes an object, not the string `api.setStatus` declares. */
export interface DelayReasonIn {
  reason: string;
  text?: string;
}

/** B's POST /admin/demo/clock adds these stats to `DemoClock`. */
export interface ClockResult extends DemoClock {
  escalations?: { escalated_l1: number; escalated_l2: number; auto_closed: number; alerts: number };
}
