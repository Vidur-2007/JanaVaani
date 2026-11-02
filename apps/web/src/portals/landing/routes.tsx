// Landing portal (Laptop A). Mounted as the index route "/".
// P6: no nested <Routes> here — an index route has no trailing "*", so React Router warned on every visit.
import { lazy } from 'react';

const Landing = lazy(() => import('./Landing'));

export default function LandingRoutes() {
  return <Landing />;
}
