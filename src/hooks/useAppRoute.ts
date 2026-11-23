import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildRoutePath,
  defaultRoute,
  getProjectIdFromSearch,
  getRouteByPath,
  type AppRoute,
} from '@/lib/appRoute';

interface AppLocation {
  route: AppRoute;
  projectId: string | null;
  navigationVersion: number;
}

export interface NavigateOptions {
  projectId?: string | null;
  replace?: boolean;
}

function readLocation(navigationVersion = 0): AppLocation {
  if (typeof window === 'undefined') {
    return { route: defaultRoute, projectId: null, navigationVersion };
  }

  const route = getRouteByPath(window.location.pathname);
  return {
    route,
    navigationVersion,
    projectId: route.section === 'designer'
      ? getProjectIdFromSearch(window.location.search)
      : null,
  };
}

function canonicalizeLocation(location: AppLocation) {
  const canonicalPath = buildRoutePath(location.route, location.projectId, window.location.search);
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (canonicalPath !== currentPath) {
    window.history.replaceState(null, '', canonicalPath);
  }
}

export function useAppRoute() {
  const [location, setLocation] = useState<AppLocation>(() => readLocation());
  const navigationVersion = useRef(0);
  const getNavigationVersion = useCallback(() => navigationVersion.current, []);

  useEffect(() => {
    canonicalizeLocation(readLocation());
    const handlePopState = () => {
      navigationVersion.current += 1;
      const nextLocation = readLocation(navigationVersion.current);
      canonicalizeLocation(nextLocation);
      setLocation(nextLocation);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: string, options?: NavigateOptions) => {
    const nextRoute = getRouteByPath(path);
    const hasProjectIdOption = options && Object.prototype.hasOwnProperty.call(options, 'projectId');
    const projectId = nextRoute.section !== 'designer' ? null : hasProjectIdOption
      ? options.projectId ?? null
      : getProjectIdFromSearch(window.location.search);
    const nextPath = buildRoutePath(nextRoute, projectId, window.location.search);
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (currentPath !== nextPath) {
      navigationVersion.current += 1;
      if (options?.replace) window.history.replaceState(null, '', nextPath);
      else window.history.pushState(null, '', nextPath);
    }

    setLocation({ route: nextRoute, projectId, navigationVersion: navigationVersion.current });
  }, []);

  const isActive = useCallback(
    (path: string) => location.route.path === getRouteByPath(path).path,
    [location.route.path],
  );

  return {
    route: location.route,
    projectId: location.projectId,
    navigationVersion: location.navigationVersion,
    navigate,
    isActive,
    getNavigationVersion,
  };
}
