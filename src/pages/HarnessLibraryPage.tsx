import { FileText, FolderOpen, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import type { Project } from '@/types/user';

interface HarnessLibraryPageProps {
  onOpenProject: (project: Project) => void;
  onNavigateHome: () => void;
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function HarnessLibraryPage({ onOpenProject, onNavigateHome }: HarnessLibraryPageProps) {
  const currentUser = useUserStore((state) => state.currentUser);
  const projects = useProjectStore((state) => state.projects);
  const [query, setQuery] = useState('');

  const userProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return projects
      .filter((project) => project.userId === currentUser?.id)
      .filter((project) => {
        if (!normalizedQuery) return true;
        return (
          project.name.toLowerCase().includes(normalizedQuery) ||
          project.description.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [currentUser?.id, projects, query]);

  if (!currentUser) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <FolderOpen className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-base font-semibold text-slate-900">尚未登录</h2>
          <p className="mt-2 text-sm text-slate-500">
            线束库按当前登录用户展示项目，请先登录后再查看。
          </p>
          <button
            type="button"
            onClick={onNavigateHome}
            className="mt-5 cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:p-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">线束库</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                当前为数据库项目目录，项目数据会随账号保存。
              </p>
            </div>
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              共 {userProjects.length} 项
            </div>
          </div>

          <label className="relative mt-4 block max-w-xl">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索线束项目名称或描述"
              className="h-10 w-full rounded-md border border-slate-200 bg-white pr-3 pl-9 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </section>

        {userProjects.length === 0 ? (
          <section className="rounded-lg border border-slate-200 bg-white py-16 text-center shadow-sm">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-base font-semibold text-slate-700">暂无线束项目</h3>
            <p className="mt-2 text-sm text-slate-500">可在首页新建项目，或导入已有设计文件。</p>
            <button
              type="button"
              onClick={onNavigateHome}
              className="mt-5 cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              前往首页
            </button>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {userProjects.map((project) => (
              <article
                key={project.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-900" title={project.name}>
                      {project.name}
                    </h3>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">
                      {project.description || '暂无描述'}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
                  <div>
                    <dt>创建时间</dt>
                    <dd className="mt-1 font-medium text-slate-700">{formatDate(project.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>更新时间</dt>
                    <dd className="mt-1 font-medium text-slate-700">{formatDate(project.updatedAt)}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={() => onOpenProject(project)}
                  className="mt-4 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <FolderOpen className="h-4 w-4" />
                  打开到设计器
                </button>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
