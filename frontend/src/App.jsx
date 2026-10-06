import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, MetaProvider, RealtimeProvider, ToastProvider, useAuth } from './context/AppContext.jsx';
import Layout from './components/Layout.jsx';
import { Logo } from './components/ui.jsx';

const Landing = lazy(() => import('./pages/Landing.jsx'));
const Auth = lazy(() => import('./pages/Auth.jsx'));
const Home = lazy(() => import('./pages/Home.jsx'));
const Report = lazy(() => import('./pages/Report.jsx'));
const Explore = lazy(() => import('./pages/Explore.jsx'));
const ItemDetail = lazy(() => import('./pages/ItemDetail.jsx'));
const Matches = lazy(() => import('./pages/Matches.jsx'));
const Claims = lazy(() => import('./pages/Claims.jsx'));
const Chat = lazy(() => import('./pages/Chat.jsx'));
const Handover = lazy(() => import('./pages/Handover.jsx'));
const Scan = lazy(() => import('./pages/Scan.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const SettingsPage = lazy(() => import('./pages/Settings.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const AdminCustody = lazy(() => import('./pages/admin/Custody.jsx'));
const AdminRecycling = lazy(() => import('./pages/admin/Recycling.jsx'));
const AdminCompanies = lazy(() => import('./pages/admin/Companies.jsx'));
const AdminPolicies = lazy(() => import('./pages/admin/Policies.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/Users.jsx'));

function Splash() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <Logo size={56} />
      <span className="sr-only">Cargando Lost&amp;Found Smart…</span>
    </div>
  );
}

function Root() {
  const navigate = useNavigate();
  return (
    <RealtimeProvider onNavigate={navigate}>
      <div id="route-announcer" className="sr-only" aria-live="polite" aria-atomic="true" />
      <Suspense fallback={<Splash />}>
        <Outlet />
      </Suspense>
    </RealtimeProvider>
  );
}

function RequireAuth({ staff = false, admin = false }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to={`/ingresar?volver=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/inicio" replace />;
  if (staff && user.role === 'user') return <Navigate to="/inicio" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  return user?.verified ? <Navigate to="/inicio" replace /> : <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Landing /> },
      {
        element: <PublicOnly />,
        children: [
          { path: '/ingresar', element: <Auth mode="login" /> },
          { path: '/registro', element: <Auth mode="register" /> },
        ],
      },
      { path: '/verificar', element: <Auth mode="verify" /> },
      {
        element: <RequireAuth />,
        children: [{
          element: <Layout />,
          children: [
            { path: '/inicio', element: <Home /> },
            { path: '/explorar', element: <Explore /> },
            { path: '/reportar/:kind', element: <Report /> },
            { path: '/objetos/:id', element: <ItemDetail /> },
            { path: '/coincidencias/:id', element: <Matches /> },
            { path: '/reclamos', element: <Claims /> },
            { path: '/chat/:id', element: <Chat /> },
            { path: '/entrega/:id', element: <Handover /> },
            { path: '/escanear', element: <Scan /> },
            { path: '/notificaciones', element: <Notifications /> },
            { path: '/ajustes', element: <SettingsPage /> },
            {
              element: <RequireAuth staff />,
              children: [
                { path: '/admin', element: <AdminDashboard /> },
                { path: '/admin/custodia', element: <AdminCustody /> },
                { path: '/admin/reciclaje', element: <AdminRecycling /> },
                { path: '/admin/empresas', element: <AdminCompanies /> },
                { path: '/admin/politicas', element: <AdminPolicies /> },
              ],
            },
            { element: <RequireAuth admin />, children: [{ path: '/admin/usuarios', element: <AdminUsers /> }] },
            { path: '*', element: <NotFound /> },
          ],
        }],
      },
    ],
  },
]);

export default function App() {
  return (
    <MetaProvider>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </MetaProvider>
  );
}
