import { useEffect, useState } from 'react';
import { Download, Edit3, FolderOpen, HardDrive, History, Plus, Trash2, Upload } from 'lucide-react';
import { createDesignFile, downloadTextFile, safeFilename, type DesignFilePreview } from '@/lib/designFile';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import { ActionToast } from '@/components/shared/ActionToast';
import { DeleteConfirmToast } from '@/components/shared/DeleteConfirmToast';
import { ImportProjectDialog } from '@/components/project/ImportProjectDialog';
import { projectRepository } from '@/repositories/projectRepository';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import type { Project } from '@/types/user';

interface ProjectListProps {
  onNewProject: () => void;
  onOpenProject: (project: Project) => void;
}

function getTimestamp() {
  return Date.now();
}

export function ProjectList({ onNewProject, onOpenProject }: ProjectListProps) {
  const { currentUser } = useUserStore();
  const { projects, createProject, deleteProject, updateProject } = useProjectStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteToast, setDeleteToast] = useState<Project | null>(null);
  const [statusToast, setStatusToast] = useState<{
    tone: 'success' | 'danger';
    message: string;
  } | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const userProjects = projects
    .filter((project) => project.userId === currentUser?.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  useEffect(() => {
    if (!deleteToast) return;
    const timer = window.setTimeout(() => setDeleteToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [deleteToast]);

  useEffect(() => {
    if (!statusToast) return;
    const timer = window.setTimeout(() => setStatusToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusToast]);

  const confirmDelete = (project: Project) => {
    setDeleteToast(project);
  };

  const handleDelete = async (project: Project) => {
    setDeleteToast(null);
    setDeletingProjectId(project.id);
    try {
      await deleteProject(project.id);
      setStatusToast({
        tone: 'success',
        message: `已删除项目“${project.name}”`,
      });
    } catch (error) {
      console.error('项目删除失败:', error);
      setStatusToast({
        tone: 'danger',
        message: getUserErrorMessage(error, '删除失败，请重试。'),
      });
    } finally {
      setDeletingProjectId(null);
    }
  };

  const startEdit = (project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
  };

  const saveEdit = async (projectId: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    const newName = editName.trim();

    // Update project metadata
    await updateProject(projectId, { name: newName });

    // Sync to config.name
    const result = await projectRepository.load(projectId);
    if (result.status === 'ok' && result.config.name !== newName) {
      await projectRepository.save(projectId, {
        ...result.config,
        name: newName,
        updatedAt: getTimestamp(),
      });
    }

    setEditingId(null);
  };

  const handleExport = async (project: Project) => {
    const result = await projectRepository.load(project.id);
    if (result.status !== 'ok') {
      setNotice(result.status === 'invalid'
        ? '项目结构已损坏，原始内容已保留为恢复副本，无法作为有效设计导出。'
        : '未找到项目设计数据。');
      return;
    }
    const file = createDesignFile(project, result.config);
    downloadTextFile(
      JSON.stringify(file, null, 2),
      `${safeFilename(project.name)}.wire-harness.json`,
    );
    setNotice(`已导出项目“${project.name}”`);
  };

  const handleImport = async (preview: DesignFilePreview) => {
    if (!currentUser) throw new Error('请先创建本地身份');
    const project = await createProject(
      currentUser.id,
      preview.name,
      preview.description,
      {
        ...preview.config,
        name: preview.name,
        updatedAt: Date.now(),
      },
    );
    setNotice(`已从设计文件创建项目“${project.name}”`);
  };

  const handleRestoreLatest = async (project: Project) => {
    if (!currentUser) return;
    const points = await projectRepository.listRecoveryPoints(project.id);
    const latest = points[0];
    if (!latest) {
      setNotice('该项目尚无可用恢复点；继续编辑并保存后会自动轮换保留最近 3 个。');
      return;
    }
    const recoveredName = `${project.name}（恢复 ${formatDateTime(latest.createdAt)}）`;
    await createProject(
      currentUser.id,
      recoveredName,
      `从“${project.name}”的本地恢复点创建，不覆盖原项目`,
      {
        ...latest.config,
        name: recoveredName,
        updatedAt: latest.createdAt,
      },
    );
    setNotice(`已从最新恢复点创建项目“${recoveredName}”`);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${formatDate(timestamp)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">项目管理</h1>
            <p className="mt-1 text-sm text-slate-500">
              {currentUser ? `欢迎，${currentUser.name}` : '请先创建本地身份'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" /> 导入设计
            </button>
            <button
              type="button"
              onClick={onNewProject}
              className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> 新建项目
            </button>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            <span className="text-sm font-medium">项目总数</span>
          </div>
          <span className="text-2xl font-bold">{userProjects.length}</span>
        </div>

        {notice && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}

        {userProjects.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center">
            <FolderOpen className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <h3 className="mb-2 text-lg font-medium text-slate-600">暂无项目</h3>
            <p className="mb-4 text-sm text-slate-400">新建空白项目，或导入已有设计文件</p>
            <button
              type="button"
              onClick={onNewProject}
              className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              创建项目
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {userProjects.map((project) => (
              <div
                key={project.id}
                className="group rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    {editingId === project.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        onBlur={() => void saveEdit(project.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void saveEdit(project.id);
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="w-full rounded border border-blue-300 px-2 py-1 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <h3
                        className="cursor-pointer truncate text-base font-semibold text-slate-800 hover:text-blue-600"
                        onClick={() => onOpenProject(project)}
                      >
                        {project.name}
                      </h3>
                    )}
                  </div>
                </div>

                <p className="mb-4 line-clamp-2 h-10 text-sm text-slate-500">
                  {project.description || '无描述'}
                </p>

                <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                  <span>更新于 {formatDate(project.updatedAt)}</span>
                  <span>创建于 {formatDate(project.createdAt)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenProject(project)}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    <FolderOpen className="h-4 w-4" /> 打开
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport(project)}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-green-50 hover:text-green-600"
                    title="导出设计"
                    aria-label={`导出项目 ${project.name}`}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRestoreLatest(project)}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                    title="从最新恢复点另存项目"
                    aria-label={`恢复项目 ${project.name}`}
                  >
                    <History className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(project)}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    title="重命名"
                    aria-label={`重命名项目 ${project.name}`}
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDelete(project)}
                    disabled={deletingProjectId === project.id}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    title="删除"
                    aria-label={`删除项目 ${project.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ImportProjectDialog
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
          onImport={handleImport}
        />
        {deleteToast && (
          <DeleteConfirmToast
            message={`删除项目“${deleteToast.name}”？此操作不可撤销。`}
            onConfirm={() => void handleDelete(deleteToast)}
            onCancel={() => setDeleteToast(null)}
          />
        )}
        {statusToast && (
          <ActionToast
            tone={statusToast.tone}
            message={statusToast.message}
            onClose={() => setStatusToast(null)}
          />
        )}
      </div>
    </div>
  );
}
