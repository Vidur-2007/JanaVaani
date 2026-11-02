// Use inside a portal layout instead of <Outlet/> to get per-route page transitions (AnimatePresence).
// Pages still wrap their content in <PageTransition>.
import { cloneElement, type ReactElement } from 'react';
import { useLocation, useOutlet } from 'react-router';
import { AnimatePresence } from 'motion/react';

export function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait" initial={false}>
      {outlet && cloneElement(outlet as ReactElement, { key: location.pathname })}
    </AnimatePresence>
  );
}
