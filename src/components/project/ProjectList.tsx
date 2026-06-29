import { useState } from 'react';
import { Plus, FolderOpen, Clock, CheckCircle, Archive, Trash2, Edit3, Cable } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import type { Project } from '@/types/user';

interface ProjectListProps {
  onNewProject: () => void;
  onOpenProject: (project: Project) => void;
}

const statusConfig = {
  draft: { label: '草稿', icon: <Clock className="w-3.5 h-3.5" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  in_progress: { label: '进行中', icon: <Cable className="w-3.5 h-3.5" />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  completed: { label: '已完成', icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'text-green-600 bg-green-50 border-green-200' },
  archived: { label: '已归档', icon: <Archive className="w-3.5 h-3.5" />, color: 'text-slate-500 bg-slate-50 border-slate-200' },
};

export function ProjectList({ onNewProject, onOpenProject }: ProjectListProps) {
  const { currentUser } = useUserStore();
  const { projects, deleteProject, updateProject } = useProjectStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const userProjects = projects
    .filter((p) => p.userId === currentUser?.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const handleDelete = (projectId: string) => {
    if (confirm('确定要删除这个项目吗？此操作不可撤销。')) {
      deleteProject(projectId);
    }
  };

  const startEdit = (project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
  };

  const saveEdit = (projectId: string) => {
    if (editName.trim()) {
      updateProject(projectId, { name: editName.trim() });
    }
    setEditingId(null);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">项目管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            {currentUser ? `欢迎，${currentUser.name}` : '请先登录'}
          </p>
        </div>
        <button
          onClick={onNewProject}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" /> 新建项目
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {(['draft', 'in_progress', 'completed', 'archived'] as const).map((status) => {
          const count = userProjects.filter((p) => p.status === status).length;
          const cfg = statusConfig[status];
          return (
            <div key={status} className={`p-4 rounded-xl border ${cfg.color}`}>
              <div className="flex items-center gap-2 mb-1">
                {cfg.icon}
                <span className="text-xs font-medium">{cfg.label}</span>
              </div>
              <div className="text-2xl font-bold">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Project List */}
      {userProjects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
          <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">暂无项目</h3>
          <p className="text-sm text-slate-400 mb-4">点击右上角按钮创建您的第一个线束设计项目</p>
          <button
            onClick={onNewProject}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            创建项目
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {userProjects.map((project) => {
            const cfg = statusConfig[project.status];
            return (
              <div
                key={project.id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    {editingId === project.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => saveEdit(project.id)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(project.id)}
                        autoFocus
                        className="w-full px-2 py-1 border border-blue-300 rounded text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <h3
                        className="text-base font-semibold text-slate-800 truncate cursor-pointer hover:text-blue-600"
                        onClick={() => onOpenProject(project)}
                      >
                        {project.name}
                      </h3>
                    )}
                  </div>
                  <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-medium border ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>

                <p className="text-sm text-slate-500 mb-4 line-clamp-2 h-10">
                  {project.description || '无描述'}
                </p>

                <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
                  <span>更新于 {formatDate(project.updatedAt)}</span>
                  <span>创建于 {formatDate(project.createdAt)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenProject(project)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" /> 打开
                  </button>
                  <button
                    onClick={() => startEdit(project)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="重命名"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
