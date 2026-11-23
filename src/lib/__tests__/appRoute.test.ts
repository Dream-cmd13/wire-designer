import { describe, expect, it } from 'vitest';
import {
  appRoutes,
  buildDwgViewerRoutePath,
  buildProjectRoutePath,
  buildRoutePath,
  getDwgFileFromSearch,
  getProjectIdFromSearch,
  getRouteByPath,
  getModelIdFromSearch,
  buildModelViewerRoutePath,
} from '@/lib/appRoute';

describe('app routes', () => {
  it.each(['/', '/home', '/designer', '/unknown'])('resolves %s to the designer project list without an old project id', (path) => {
    const route = getRouteByPath(`${path}?projectId=old`);
    expect(route).toBe(appRoutes['designer-projects']);
    expect(buildRoutePath(route, 'old', '?projectId=old')).toBe('/designer');
  });

  it('preserves modelId on model route and removes it for local previews', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    expect(getRouteByPath('/model-viewer')).toEqual(appRoutes['model-viewer']);
    expect(getModelIdFromSearch(`?modelId=${id}`)).toBe(id);
    expect(getModelIdFromSearch('?modelId=bad')).toBeNull();
    expect(buildRoutePath(appRoutes['model-viewer'], null, `?modelId=${id}&file=old`)).toBe(`/model-viewer?modelId=${id}`);
    expect(buildModelViewerRoutePath('/model-viewer', null)).toBe('/model-viewer');
  });
  it.each(['designer-design', 'designer-product-image'] as const)('resolves a deep link for %s with its project id', (id) => {
    const path = `${appRoutes[id].path}?projectId=project-1`;
    const route = getRouteByPath(path);
    expect(route).toBe(appRoutes[id]);
    expect(buildRoutePath(route, 'project-1', '')).toBe(path);
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

  it('keeps the DWG file and restricts the project id to editor routes', () => {
    expect(buildRoutePath(appRoutes['dwg-viewer'], null, '?file=M12A04-07-068-3-10-500.dwg')).toBe(
      '/dwg-viewer?file=M12A04-07-068-3-10-500.dwg',
    );
    expect(buildRoutePath(appRoutes['dwg-viewer'], null, '?projectId=p1')).toBe('/dwg-viewer');
    expect(buildRoutePath(appRoutes['designer-design'], 'p1', '?projectId=p1&file=old.dwg')).toBe(
      '/designer/design?projectId=p1',
    );
    expect(buildRoutePath(appRoutes.materials, 'p1', '?file=old.dwg')).toBe('/materials');
  });
});
