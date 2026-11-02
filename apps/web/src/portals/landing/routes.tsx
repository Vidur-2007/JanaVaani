// Landing portal (Laptop A). Mounted at "/".
import { lazy } from 'react';
import { Route, Routes } from 'react-router';

const Landing = lazy(() => import('./Landing'));

export default function LandingRoutes() {
  return (
    <Routes>
      <Route index element={<Landing />} />
    </Routes>
  );
}
