import { useCallback, useEffect, useState } from 'react';
import { defaultRoute, getRouteByPath, type AppRoute } from '@/lib/appRoute';

function readRoute() {
  if (typeof window === 'undefined') {
    return defaultRoute;
  }
  return getRouteByPath(window.location.pathname);
}

export function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(() => readRoute());

  useEffect(() => {
    const nextRoute = readRoute();
    if (nextRoute.path !== window.location.pathname) {
      window.history.replaceState(null, '', nextRoute.path);
    }

    const handlePopState = () => setRoute(readRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: string) => {
    const nextRoute = getRouteByPath(path);
    if (window.location.pathname !== nextRoute.path) {
      window.history.pushState(null, '', nextRoute.path);
    }
    setRoute(nextRoute);
  }, []);

  const isActive = useCallback((path: string) => route.path === getRouteByPath(path).path, [route.path]);

  return { route, navigate, isActive };
}
