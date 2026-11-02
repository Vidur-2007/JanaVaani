// Laptop C: extra contract types added during isolation go here (moved to packages/contracts at the H30 merge).

/** What #30 accepts for a delay: B's StatusIn takes an object, not the string `api.setStatus` declares. */
export interface DelayReasonIn {
  reason: string;
  text?: string;
}
