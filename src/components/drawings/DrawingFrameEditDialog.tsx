import React, { useState, useEffect, useRef } from 'react';
import { X, UserCheck, Calendar, FileText, Check, RotateCcw } from 'lucide-react';
import type { ProductionDrawingFrame } from '@/types/harness';
import { formatDrawingDate, DEFAULT_TECHNICAL_REQUIREMENTS } from '@/lib/drawingFrameDefaults';
import { useUserStore } from '@/stores/userStore';

interface DrawingFrameEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  frame: ProductionDrawingFrame;
  onSave: (updatedFrame: ProductionDrawingFrame) => void;
  initialFocusField?: string;
}

export const DrawingFrameEditDialog: React.FC<DrawingFrameEditDialogProps> = ({
  isOpen,
  onClose,
  frame,
  onSave,
  initialFocusField,
}) => {
  const currentUser = useUserStore((s) => s.currentUser);
  const syncKey = `${isOpen}:${frame.drawingNo}:${frame.title}:${frame.partNo}:${frame.revision}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  const [formData, setFormData] = useState<ProductionDrawingFrame>(frame);
  const techReqsRef = useRef<HTMLTextAreaElement>(null);

  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    if (isOpen) {
      setFormData(frame);
    }
  }

  useEffect(() => {
    if (isOpen && initialFocusField === 'technicalRequirements') {
      const timer = setTimeout(() => {
        techReqsRef.current?.focus();
        techReqsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialFocusField]);

  if (!isOpen) return null;

  const handleFillCurrentUser = () => {
    const name = currentUser?.name?.trim() || '工程师';
    setFormData((prev) => ({
      ...prev,
      approved: { ...prev.approved, name },
      designer: { ...prev.designer, name },
      drawn: { ...prev.drawn, name },
    }));
  };

  const handleFillToday = () => {
    const today = formatDrawingDate(new Date());
    setFormData((prev) => ({
      ...prev,
      approved: { ...prev.approved, date: today },
      designer: { ...prev.designer, date: today },
      drawn: { ...prev.drawn, date: today },
    }));
  };

  const handleRevisionRowChange = (index: number, key: 'rev' | 'description' | 'date', val: string) => {
    setFormData((prev) => {
      const rows = [...(prev.revisionRows || [])];
      while (rows.length < 4) {
        rows.push({ rev: '', description: '', date: '' });
      }
      rows[index] = { ...rows[index], [key]: val };
      return { ...prev, revisionRows: rows };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-800">编辑图纸图框信息</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* 1. 基本标题栏信息 */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              基本图纸信息
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  料号 (PART.NO)
                </label>
                <input
                  type="text"
                  value={formData.partNo}
                  onChange={(e) => setFormData({ ...formData, partNo: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  placeholder="例如: M12A04-07-093-1-10-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  图纸标题 (TITLE)
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="例如: M12公直头成型式线束"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  图号 (DWG.NO)
                </label>
                <input
                  type="text"
                  value={formData.drawingNo}
                  onChange={(e) => setFormData({ ...formData, drawingNo: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  placeholder="ENDE05"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  版本 (REV)
                </label>
                <input
                  type="text"
                  value={formData.revision}
                  onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="X0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  页码 (SHEET)
                </label>
                <input
                  type="text"
                  value={formData.sheet}
                  onChange={(e) => setFormData({ ...formData, sheet: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="1/1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  比例 (SCALE)
                </label>
                <input
                  type="text"
                  value={formData.scale}
                  onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="1:1"
                />
              </div>
            </div>
          </div>

          {/* 2. 签署与签审信息 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                签审签署人员及日期
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFillCurrentUser}
                  className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                >
                  <UserCheck className="h-3 w-3" />
                  填入当前登录人
                </button>
                <button
                  type="button"
                  onClick={handleFillToday}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Calendar className="h-3 w-3" />
                  填入今天日期
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* APPROVED */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                <span className="text-xs font-bold text-slate-700">审核 (APPROVED)</span>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">姓名</label>
                  <input
                    type="text"
                    value={formData.approved?.name || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        approved: { ...formData.approved, name: e.target.value },
                      })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    placeholder="姓名"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">日期</label>
                  <input
                    type="text"
                    value={formData.approved?.date || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        approved: { ...formData.approved, date: e.target.value },
                      })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    placeholder="YYYY.MM.DD"
                  />
                </div>
              </div>

              {/* DESIGNER */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                <span className="text-xs font-bold text-slate-700">设计 (DESIGNER)</span>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">姓名</label>
                  <input
                    type="text"
                    value={formData.designer?.name || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        designer: { ...formData.designer, name: e.target.value },
                      })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    placeholder="姓名"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">日期</label>
                  <input
                    type="text"
                    value={formData.designer?.date || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        designer: { ...formData.designer, date: e.target.value },
                      })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    placeholder="YYYY.MM.DD"
                  />
                </div>
              </div>

              {/* DRAWN */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                <span className="text-xs font-bold text-slate-700">绘图 (DRAWN)</span>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">姓名</label>
                  <input
                    type="text"
                    value={formData.drawn?.name || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        drawn: { ...formData.drawn, name: e.target.value },
                      })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    placeholder="姓名"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">日期</label>
                  <input
                    type="text"
                    value={formData.drawn?.date || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        drawn: { ...formData.drawn, date: e.target.value },
                      })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    placeholder="YYYY.MM.DD"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. 修订记录表 */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              修订记录 (REVISION RECORD)
            </h3>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <tr>
                    <th className="p-2 w-16 text-center">版本</th>
                    <th className="p-2">修订说明 (DESCRIPTION)</th>
                    <th className="p-2 w-28 text-center">日期</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {[0, 1, 2, 3].map((rowIdx) => {
                    const row = formData.revisionRows?.[rowIdx] || { rev: '', description: '', date: '' };
                    return (
                      <tr key={rowIdx}>
                        <td className="p-1 text-center">
                          <input
                            type="text"
                            value={row.rev}
                            onChange={(e) => handleRevisionRowChange(rowIdx, 'rev', e.target.value)}
                            className="w-full rounded border border-slate-200 px-1.5 py-1 text-center text-xs"
                            placeholder={rowIdx === 0 ? 'X0' : ''}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => handleRevisionRowChange(rowIdx, 'description', e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                            placeholder={rowIdx === 0 ? 'NEW RELEASE' : ''}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            value={row.date}
                            onChange={(e) => handleRevisionRowChange(rowIdx, 'date', e.target.value)}
                            className="w-full rounded border border-slate-200 px-1.5 py-1 text-center text-xs"
                            placeholder={rowIdx === 0 ? 'YYYY.MM.DD' : ''}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. 技术要求 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                技术要求 (TECHNICAL REQUIREMENTS)
              </h3>
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    technicalRequirements: DEFAULT_TECHNICAL_REQUIREMENTS,
                  }))
                }
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                恢复默认要求
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                成品图左下角技术要求内容（支持多行编辑）
              </label>
              <textarea
                ref={techReqsRef}
                rows={8}
                value={formData.technicalRequirements ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, technicalRequirements: e.target.value })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="请输入技术要求..."
              />
              <p className="mt-1 text-[11px] text-slate-400">
                提示：显示于成品图左下角空白区域，首行将以“技术要求：”大标题加粗排版。
              </p>
            </div>
          </div>

          {/* 5. 技术说明与公司 */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              技术标准与公司名称
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                顶部合规控制说明
              </label>
              <input
                type="text"
                value={formData.complianceNote}
                onChange={(e) => setFormData({ ...formData, complianceNote: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">公司中文名</label>
                <input
                  type="text"
                  value={formData.companyNameCn}
                  onChange={(e) => setFormData({ ...formData, companyNameCn: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">公司英文名</label>
                <input
                  type="text"
                  value={formData.companyNameEn}
                  onChange={(e) => setFormData({ ...formData, companyNameEn: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 shadow-xs"
          >
            <Check className="h-3.5 w-3.5" />
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
};
