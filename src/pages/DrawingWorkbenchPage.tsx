import { Boxes, Download, FileImage, FileText, LayoutTemplate, Table2 } from 'lucide-react';
import { appRoutes } from '@/lib/appRoute';
import { useHarnessStore } from '@/stores/harnessStore';
import type { Project } from '@/types/user';

interface DrawingWorkbenchPageProps {
  currentProject: Project | null;
  onNavigate: (path: string) => void;
  onChooseDrawings: () => void;
}

export function DrawingWorkbenchPage({
  currentProject,
  onNavigate,
  onChooseDrawings,
}: DrawingWorkbenchPageProps) {
  const config = useHarnessStore((state) => state.config);

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <LayoutTemplate className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-base font-semibold text-slate-900">尚未打开项目</h2>
          <p className="mt-2 text-sm text-slate-500">
            请先在首页或线束库打开一个项目，再进入制作图纸工作台。
          </p>
          <button
            type="button"
            onClick={() => onNavigate(appRoutes.home.path)}
            className="mt-5 cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  const stats = [
    { label: '连接器', value: config.connectors.length },
    { label: '线材', value: config.materials.length },
    { label: '保护套', value: config.protectiveSleeves.length },
    { label: '成品图', value: config.twoDImages?.length ?? 0 },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:p-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">制作图纸工作台</h2>
              <p className="mt-1 text-sm text-slate-500">
                当前项目：{currentProject.name}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate(appRoutes['designer-product-image'].path)}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FileImage className="h-3.5 w-3.5" />
                查看成品图
              </button>
              <button
                type="button"
                onClick={onChooseDrawings}
                className="flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800"
              >
                <FileText className="h-3.5 w-3.5" />
                选择 PDF
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">图纸画布</h3>
                <p className="mt-0.5 text-xs text-slate-500">后续承载图框、接线图和成品图编排。</p>
              </div>
              <LayoutTemplate className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-h-[420px] bg-[linear-gradient(#e2e8f0_1px,transparent_1px),linear-gradient(90deg,#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] p-4">
              <div className="flex h-full min-h-[388px] items-center justify-center rounded-md border border-dashed border-slate-300 bg-white/80">
                <div className="max-w-sm text-center">
                  <LayoutTemplate className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-700">制图编辑器预留区</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    第一版先建立独立工作台入口，完整图框编辑、BOM 表格排版、接线图导出将在后续迭代实现。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Boxes className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-900">图纸组成</h3>
              </div>
              <div className="space-y-2 text-sm">
                <button
                  type="button"
                  onClick={() => onNavigate(appRoutes['designer-pdf'].path)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span>PDF 图纸预览</span>
                  <FileText className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(appRoutes['designer-product-image'].path)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span>成品图编排</span>
                  <FileImage className="h-4 w-4 text-slate-400" />
                </button>
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-slate-500">
                  <span>BOM 表格</span>
                  <Table2 className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Download className="h-4 w-4 text-green-600" />
                <h3 className="text-sm font-semibold text-slate-900">输出动作</h3>
              </div>
              <div className="space-y-2">
                {['导出图框 PDF', '导出制造图纸', '生成物料附件'].map((label) => (
                  <button
                    type="button"
                    key={label}
                    disabled
                    className="flex w-full cursor-not-allowed items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-400"
                  >
                    <span>{label}</span>
                    <span className="text-xs">待实现</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
