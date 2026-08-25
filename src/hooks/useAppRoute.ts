import { useCallback, useEffect, useState } from 'react';
import {
  buildProjectRoutePath,
  defaultRoute,
  getProjectIdFromSearch,
  getRouteByPath,
  type AppRoute,
} from '@/lib/appRoute';

interface AppLocation {
  route: AppRoute;
  projectId: string | null;
}

export interface NavigateOptions {
  projectId?: string | null;
}

function readLocation(): AppLocation {
  if (typeof window === 'undefined') {
    return { route: defaultRoute, projectId: null };
  }

  const route = getRouteByPath(window.location.pathname);
  return {
    route,
    projectId: route.section === 'designer'
      ? getProjectIdFromSearch(window.location.search)
      : null,
  };
}

export function useAppRoute() {
  const [location, setLocation] = useState<AppLocation>(() => readLocation());

  useEffect(() => {
    const nextLocation = readLocation();
    const canonicalPath = buildProjectRoutePath(
      nextLocation.route.path,
      nextLocation.projectId,
    );
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (canonicalPath !== currentPath) {
      window.history.replaceState(null, '', canonicalPath);
    }

    const handlePopState = () => setLocation(readLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: string, options?: NavigateOptions) => {
    const nextRoute = getRouteByPath(path);
    const hasProjectIdOption = options && Object.prototype.hasOwnProperty.call(options, 'projectId');
    const projectId = hasProjectIdOption
      ? options.projectId ?? null
      : nextRoute.section === 'designer'
        ? getProjectIdFromSearch(window.location.search)
        : null;
    const nextPath = buildProjectRoutePath(nextRoute.path, projectId);
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (currentPath !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }

    setLocation({ route: nextRoute, projectId });
  }, []);

  const isActive = useCallback(
    (path: string) => location.route.path === getRouteByPath(path).path,
    [location.route.path],
  );

  return {
    route: location.route,
    projectId: location.projectId,
    navigate,
    isActive,
  };
}
