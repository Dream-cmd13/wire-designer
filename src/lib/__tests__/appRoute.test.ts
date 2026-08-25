import { describe, expect, it } from 'vitest';
import {
  appRoutes,
  buildProjectRoutePath,
  getProjectIdFromSearch,
  getRouteByPath,
} from '@/lib/appRoute';

describe('app routes', () => {
  it('resolves a route when the project id is present in the query string', () => {
    expect(getRouteByPath('/designer/design?projectId=project-1')).toEqual(
      appRoutes['designer-design'],
    );
  });

  it('reads and trims a project id from the query string', () => {
    expect(getProjectIdFromSearch('?projectId=%20project-1%20')).toBe('project-1');
    expect(getProjectIdFromSearch('?projectId=')).toBeNull();
  });

  it('adds and removes the project id without changing the route', () => {
    expect(buildProjectRoutePath('/designer/design', 'project-1')).toBe(
      '/designer/design?projectId=project-1',
    );
    expect(buildProjectRoutePath('/designer/design?projectId=old', null)).toBe(
      '/designer/design',
    );
  });
});
