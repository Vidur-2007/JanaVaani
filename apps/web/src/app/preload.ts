// P6 performance: start downloading the current route's lazy chunks and i18n namespaces at boot, in parallel,
// instead of discovering them one Suspense boundary at a time (index → portal routes → page → namespace JSON
// was 3–4 sequential round trips on mobile). Vite dedupes these with the lazy() imports in the routers.
import { i18n, initI18n } from '@/lib/i18n';

const ns = (names: string[]) => initI18n().then(() => i18n.loadNamespaces(names));

type Loader = () => Promise<unknown>;

const GOV = /^\/(officer|supervisor|admin|public)(\/|$)/;

const CITIZEN_PAGES: [RegExp, Loader][] = [
  [/^\/app\/?$/, () => import('@/portals/citizen/pages/Home')],
  [/^\/app\/report\/quick\/?$/, () => import('@/portals/citizen/report/QuickReport')],
  [/^\/app\/report\/?$/, () => import('@/portals/citizen/report/ReportPage')],
  [/^\/app\/complaints\/?$/, () => import('@/portals/citizen/pages/Complaints')],
  [/^\/app\/complaints\/[^/]+\/?$/, () => import('@/portals/citizen/pages/ComplaintDetail')],
  [/^\/app\/notifications\/?$/, () => import('@/portals/citizen/pages/Notifications')],
  [/^\/app\/settings\/?$/, () => import('@/portals/citizen/pages/Settings')],
  [/^\/app\/nearby\/?$/, () => import('@/portals/citizen/pages/Nearby')],
  [/^\/login\/?$/, () => import('@/portals/citizen/pages/Login')],
  [/^\/onboarding\/?$/, () => import('@/portals/citizen/pages/Onboarding')],
  [/^\/track\/?$/, () => import('@/portals/citizen/pages/Track')],
  [/^\/guide\/?$/, () => import('@/portals/citizen/pages/Guide')],
  [/^\/r\/[^/]+\/?$/, () => import('@/portals/citizen/pages/AssetEntry')],
];

/** Kick off the chunks for `pathname`; resolves when they (and their namespaces) are in. Never rejects. */
export function preloadRoute(pathname: string): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  if (pathname === '/' || pathname === '') {
    jobs.push(import('@/portals/landing/routes'), import('@/portals/landing/Landing'), ns(['landing']));
  } else if (!GOV.test(pathname)) {
    jobs.push(import('@/portals/citizen/routes'), ns(['citizen']));
    const page = CITIZEN_PAGES.find(([re]) => re.test(pathname));
    if (page) jobs.push(page[1]());
  }
  return Promise.allSettled(jobs).then(() => undefined);
}
