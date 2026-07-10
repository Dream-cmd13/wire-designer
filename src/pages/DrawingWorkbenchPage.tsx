import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { DrawingCanvas } from '@/components/drawings/workbench/DrawingCanvas';
import { DrawingObjectInspector } from '@/components/drawings/workbench/DrawingObjectInspector';
import { DrawingResourcePanel } from '@/components/drawings/workbench/DrawingResourcePanel';
import { DrawingValidationPanel } from '@/components/drawings/workbench/DrawingValidationPanel';
import { DrawingWizardDialog } from '@/components/drawings/workbench/DrawingWizardDialog';
import { DrawingWorkbenchToolbar } from '@/components/drawings/workbench/DrawingWorkbenchToolbar';
import { appRoutes } from '@/lib/appRoute';
import { createHarnessConfigFromDrawingWizard } from '@/lib/drawingWizard';
import {
  downloadProductionDrawingPdf,
  downloadProductionDrawingPng,
  downloadProductionDrawingSvg,
} from '@/lib/productionDrawingExport';
import { updateProductionDrawingObject } from '@/lib/productionDrawingGenerator';
import { projectRepository } from '@/repositories/projectRepository';
import { useHarnessStore } from '@/stores/harnessStore';
import type { DrawingWizardDraft, ProductionDrawingObject } from '@/types/harness';
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
  const saveState = useHarnessStore((state) => state.saveState);
  const patchDocument = useHarnessStore((state) => state.patchDocument);
  const replaceDocument = useHarnessStore((state) => state.replaceDocument);
  const markSaving = useHarnessStore((state) => state.markSaving);
  const markSaved = useHarnessStore((state) => state.markSaved);
  const markSaveError = useHarnessStore((state) => state.markSaveError);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <LayoutTemplate className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-base font-semibold text-slate-900">尚未打开项目</h2>
          <p className="mt-2 text-sm text-slate-500">
            请先在首页或线束库打开一个项目，再进入制造图工作台。
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

  const handleGenerate = (draft: DrawingWizardDraft) => {
    const nextConfig = createHarnessConfigFromDrawingWizard(config, draft);
    replaceDocument(nextConfig);
    setSelectedObjectId(nextConfig.productionDrawing?.objects[0]?.id ?? null);
    setWizardOpen(false);
  };

  const handleUpdateObject = (objectId: string, patch: Partial<ProductionDrawingObject>) => {
    const nextConfig = updateProductionDrawingObject(config, objectId, patch);
    patchDocument({
      productionDrawing: nextConfig.productionDrawing,
      updatedAt: nextConfig.updatedAt,
    });
  };

  const handleSaveDraft = async () => {
    markSaving();
    try {
      await projectRepository.save(currentProject.id, config);
      markSaved();
    } catch (error) {
      markSaveError(error instanceof Error ? error.message : '制造图草稿保存失败');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <section className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">制造图工作台</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              当前项目：{currentProject.name}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <Stat label="连接器" value={config.connectors.length} />
            <Stat label="线材" value={config.materials.length} />
            <Stat label="护套" value={config.protectiveSleeves.length} />
            <Stat label="图纸对象" value={config.productionDrawing?.objects.length ?? 0} />
          </div>
        </div>
      </section>

      <DrawingWorkbenchToolbar
        dirty={saveState.status === 'dirty'}
        onOpenWizard={() => setWizardOpen(true)}
        onChooseDrawings={onChooseDrawings}
        onOpenProductImage={() => onNavigate(appRoutes['designer-product-image'].path)}
        saving={saveState.status === 'saving'}
        onSaveDraft={() => void handleSaveDraft()}
        zoom={canvasZoom}
        onZoomIn={() => setCanvasZoom((value) => Math.min(2, Number((value + 0.1).toFixed(2))))}
        onZoomOut={() => setCanvasZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))}
        onResetZoom={() => setCanvasZoom(1)}
        canExport={Boolean(config.productionDrawing)}
        onExportSvg={() => downloadProductionDrawingSvg(config)}
        onExportPng={() => void downloadProductionDrawingPng(config)}
        onExportPdf={() => downloadProductionDrawingPdf(config)}
      />

      <div className="flex min-h-0 flex-1">
        <DrawingResourcePanel config={config} />
        <DrawingCanvas
          config={config}
          selectedObjectId={selectedObjectId ?? undefined}
          onSelectObject={setSelectedObjectId}
          zoom={canvasZoom}
        />
        <DrawingObjectInspector
          config={config}
          selectedObjectId={selectedObjectId}
          onSelectObject={setSelectedObjectId}
          onUpdateObject={handleUpdateObject}
        />
      </div>

      <DrawingValidationPanel config={config} />

      <DrawingWizardDialog
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onGenerate={handleGenerate}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold leading-none text-slate-900">{value}</p>
    </div>
  );
}
