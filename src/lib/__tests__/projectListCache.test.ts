import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCachedProjects,
  getCachedProjects,
  setCachedProjects,
} from '@/lib/projectListCache';
import type { Project } from '@/types/user';

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

function makeProject(id: string, userId: string, name: string): Project {
  return {
    id,
    userId,
    name,
    description: `Desc ${id}`,
    createdAt: 1000,
    updatedAt: 2000,
  };
}

describe('projectListCache', () => {
  beforeEach(() => {
    const mock = createMockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mock,
      writable: true,
      configurable: true,
    });
  });

  it('reads and writes cached projects per user', () => {
    const user1Projects = [makeProject('p1', 'user1', 'Project 1')];
    const user2Projects = [makeProject('p2', 'user2', 'Project 2')];

    setCachedProjects('user1', user1Projects);
    setCachedProjects('user2', user2Projects);

    expect(getCachedProjects('user1')).toEqual(user1Projects);
    expect(getCachedProjects('user2')).toEqual(user2Projects);
  });

  it('returns null for non-existent cache', () => {
    expect(getCachedProjects('unknown-user')).toBeNull();
  });

  it('expires cache after specified TTL', () => {
    const projects = [makeProject('p1', 'user1', 'Project 1')];
    setCachedProjects('user1', projects);

    // With negative TTL, it should be expired
    expect(getCachedProjects('user1', -1)).toBeNull();
  });

  it('clears cache for specific user or all users', () => {
    setCachedProjects('user1', [makeProject('p1', 'user1', 'Project 1')]);
    setCachedProjects('user2', [makeProject('p2', 'user2', 'Project 2')]);

    clearCachedProjects('user1');
    expect(getCachedProjects('user1')).toBeNull();
    expect(getCachedProjects('user2')).not.toBeNull();

    clearCachedProjects();
    expect(getCachedProjects('user2')).toBeNull();
  });

  it('ignores malformed cache data gracefully', () => {
    localStorage.setItem('wh_projects_v1_user1', 'invalid json string');
    expect(getCachedProjects('user1')).toBeNull();
  });
});
