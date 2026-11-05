import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';

// Телефоны и планшеты получают отдельную, лёгкую версию (без three.js).
// Принудительно: ?mobile или ?desktop в адресе.
const q = new URLSearchParams(window.location.search);
const isMobile = q.has('mobile') || (!q.has('desktop') && window.matchMedia('(max-width: 820px), (pointer: coarse) and (max-width: 1366px)').matches);

const Desktop = lazy(() => import('./App'));
const Mobile = lazy(() => import('./mobile/MobileApp'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      {isMobile ? <Mobile /> : <Desktop />}
    </Suspense>
  </StrictMode>,
);
