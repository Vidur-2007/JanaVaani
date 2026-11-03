// Gov navigation by role (Spec C §3). Sidebar, bottom sheet, breadcrumbs and command palette all read this.
import type { ComponentType, SVGProps } from 'react';
import {
  Bell,
  BrainCircuit,
  Building2,
  ChartLine,
  ClipboardCheck,
  FileChartColumn,
  FlaskConical,
  Globe,
  Inbox,
  LayoutDashboard,
  Map,
  QrCode,
  ShieldCheck,
  Trophy,
  Users,
  Waypoints,
} from 'lucide-react';
import type { Role } from '@contracts/types';
import { DEMO_MODE } from '@/lib/api/client';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles: Role[];
  end?: boolean;
}
export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const FIELD: Role[] = ['officer', 'supervisor', 'admin'];
const LEAD: Role[] = ['supervisor', 'admin'];
const ADMIN: Role[] = ['admin'];

const GROUPS: NavGroup[] = [
  {
    labelKey: 'nav.group_department',
    items: [
      { to: '/officer', labelKey: 'nav.inbox', icon: Inbox, roles: FIELD, end: true },
      { to: '/officer/incidents', labelKey: 'nav.incidents', icon: Waypoints, roles: FIELD },
      { to: '/officer/stats', labelKey: 'nav.my_stats', icon: Trophy, roles: FIELD },
      { to: '/supervisor', labelKey: 'nav.queues', icon: ClipboardCheck, roles: LEAD },
    ],
  },
  {
    labelKey: 'nav.group_government',
    items: [
      { to: '/admin', labelKey: 'nav.command_center', icon: LayoutDashboard, roles: LEAD, end: true },
      { to: '/admin/map', labelKey: 'nav.map', icon: Map, roles: ADMIN },
      { to: '/admin/departments', labelKey: 'nav.departments', icon: Building2, roles: ADMIN },
      { to: '/admin/officers', labelKey: 'nav.officers', icon: Users, roles: ADMIN },
      { to: '/admin/analytics', labelKey: 'nav.analytics', icon: ChartLine, roles: ADMIN },
      { to: '/admin/alerts', labelKey: 'nav.alerts', icon: Bell, roles: LEAD },
      { to: '/admin/audit', labelKey: 'nav.audit', icon: ShieldCheck, roles: ADMIN },
      { to: '/admin/ai', labelKey: 'nav.ai', icon: BrainCircuit, roles: ADMIN },
      { to: '/admin/reports', labelKey: 'nav.reports', icon: FileChartColumn, roles: ADMIN },
      { to: '/admin/assets', labelKey: 'nav.assets', icon: QrCode, roles: ADMIN },
      ...(DEMO_MODE ? [{ to: '/admin/demo', labelKey: 'nav.demo', icon: FlaskConical, roles: ADMIN }] : []),
    ],
  },
  {
    labelKey: 'nav.group_public',
    items: [{ to: '/public', labelKey: 'nav.public', icon: Globe, roles: FIELD }],
  },
];

export function navForRole(role: Role | undefined): NavGroup[] {
  if (!role) return [];
  return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter(
    (g) => g.items.length > 0,
  );
}

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

/** Longest nav item matching the path, for breadcrumbs. */
export function navItemForPath(pathname: string): NavItem | undefined {
  return ALL_ITEMS.filter((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
}
