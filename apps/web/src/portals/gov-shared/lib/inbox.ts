// Inbox rules shared by the palette and the officer inbox (Spec C §5.1).
import type { Grievance, Status } from '@contracts/types';
import { API_BASE } from '@/lib/api/client';
import { TIME_ZONE } from '@/lib/i18n/useLangFormat';

const TICKET = /^GRV-\d{4}-\d+$/i;

/** A full ticket id, or a bare number padded into this year's id ("123" → GRV-2026-000123). */
export function ticketFromInput(input: string): string | null {
  const s = input.trim();
  if (TICKET.test(s)) return s.toUpperCase();
  if (/^\d{1,6}$/.test(s)) return `GRV-${new Date().getFullYear()}-${s.padStart(6, '0')}`;
  return null;
}

const CLOSED: Status[] = ['closed', 'rejected', 'merged'];
export const isOpenStatus = (s: Status) => !CLOSED.includes(s);

/** Emergency first, then critical overdue, then score descending, then SLA remaining ascending. */
export function compareInbox(a: Grievance, b: Grievance) {
  const emergency = Number(b.is_emergency) - Number(a.is_emergency);
  if (emergency) return emergency;
  const criticalOverdue =
    Number(b.priority === 'critical' && b.sla.breached) - Number(a.priority === 'critical' && a.sla.breached);
  if (criticalOverdue) return criticalOverdue;
  if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
  return a.sla.remaining_minutes - b.sla.remaining_minutes;
}

const istDay = (d: string | number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(d));

/** Not yet breached and due on the current calendar day in India. */
export function isDueToday(g: Grievance, now = Date.now()) {
  return !g.sla.breached && istDay(g.sla.due_at) === istDay(now);
}

export const isSuspiciousClosure = (g: Grievance) => g.ai_verification?.verdict === 'suspicious';

/** Offline API deployments return host-relative media paths; everything else is already absolute. */
export const mediaUrl = (url: string) =>
  url.startsWith('/api/') ? new URL(url, API_BASE).toString() : url;

/** Case states B accepts for #38. */
export const canResolve = (s: Status) => s === 'assigned' || s === 'in_progress' || s === 'reopened';
