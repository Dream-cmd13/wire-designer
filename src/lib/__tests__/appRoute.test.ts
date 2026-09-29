import { describe, expect, it } from 'vitest';
import {
  appRoutes,
  buildDwgViewerRoutePath,
  buildProjectRoutePath,
  buildRoutePath,
  getDwgFileFromSearch,
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

  it('reads and trims a DWG file name from the query string', () => {
    expect(getDwgFileFromSearch('?file=M12A04-07-093-1-10-500.dwg')).toBe(
      'M12A04-07-093-1-10-500.dwg',
    );
    expect(getDwgFileFromSearch('?file=%20%20')).toBeNull();
    expect(getDwgFileFromSearch('')).toBeNull();
  });

  it('adds and removes the DWG file name without changing the route', () => {
    expect(buildDwgViewerRoutePath('/dwg-viewer', '线束设计器.dwg')).toBe(
      `/dwg-viewer?file=${encodeURIComponent('线束设计器.dwg')}`,
    );
    expect(buildDwgViewerRoutePath('/dwg-viewer?file=old.dwg', null)).toBe('/dwg-viewer');
  });

  it('keeps the DWG file while other routes keep only the project id', () => {
    expect(buildRoutePath(appRoutes['dwg-viewer'], null, '?file=M12A04-07-068-3-10-500.dwg')).toBe(
      '/dwg-viewer?file=M12A04-07-068-3-10-500.dwg',
    );
    expect(buildRoutePath(appRoutes['dwg-viewer'], null, '?projectId=p1')).toBe('/dwg-viewer');
    expect(buildRoutePath(appRoutes['designer-design'], 'p1', '?projectId=p1&file=old.dwg')).toBe(
      '/designer/design?projectId=p1',
    );
    expect(buildRoutePath(appRoutes.materials, null, '?file=old.dwg')).toBe('/materials');
  });
});
