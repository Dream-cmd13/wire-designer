import React, { useState, useEffect, useRef } from 'react';
import { Edit2, RotateCcw, Check, X } from 'lucide-react';
import type { CanvasWireMaterial } from '@/types/harness';
import {
  calculateDefaultWireTolerance,
  resolveWireDimension,
} from '@/lib/wireTolerance';

interface WireDimensionAnnotationProps {
  material: CanvasWireMaterial;
  width: number;
  onUpdate: (materialId: string, updates: Partial<CanvasWireMaterial>) => void;
}

export const WireDimensionAnnotation: React.FC<WireDimensionAnnotationProps> = ({
  material,
  width,
  onUpdate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const dimInfo = resolveWireDimension(material.spec.lengthMm, material.dimension);

  // Edit form state
  const [editLength, setEditLength] = useState<number>(dimInfo.length);
  const [editUpper, setEditUpper] = useState<string>(dimInfo.upper);
  const [editLower, setEditLower] = useState<string>(dimInfo.lower);
  const [editIsCustom, setEditIsCustom] = useState<boolean>(dimInfo.isCustom);

  // Synchronize draft state when material changes or editing opens
  useEffect(() => {
    if (!isEditing) {
      setEditLength(dimInfo.length);
      setEditUpper(dimInfo.upper);
      setEditLower(dimInfo.lower);
      setEditIsCustom(dimInfo.isCustom);
    }
  }, [material, dimInfo.length, dimInfo.upper, dimInfo.lower, dimInfo.isCustom, isEditing]);

  // Click outside to close popover
  useEffect(() => {
    if (!isEditing) return;
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsEditing(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing]);

  const handleResetToDefault = () => {
    const defaultTol = calculateDefaultWireTolerance(editLength);
    setEditUpper(defaultTol.upper);
    setEditLower(defaultTol.lower);
    setEditIsCustom(false);
  };

  const handleLengthChange = (newLen: number) => {
    setEditLength(newLen);
    if (!editIsCustom) {
      const defaultTol = calculateDefaultWireTolerance(newLen);
      setEditUpper(defaultTol.upper);
      setEditLower(defaultTol.lower);
    }
  };

  const handleSave = () => {
    const finalLength = Number.isFinite(editLength) && editLength > 0 ? editLength : material.spec.lengthMm;
    const defaultTol = calculateDefaultWireTolerance(finalLength);

    const isUpperDefault = editUpper.trim() === defaultTol.upper;
    const isLowerDefault = editLower.trim() === defaultTol.lower;
    const isLengthDefault = finalLength === material.spec.lengthMm;

    const isCustom = editIsCustom || !isUpperDefault || !isLowerDefault || !isLengthDefault;

    onUpdate(material.id, {
      dimension: {
        displayLength: finalLength,
        upperTolerance: editUpper.trim(),
        lowerTolerance: editLower.trim(),
        isCustom,
      },
    });
    setIsEditing(false);
  };

  const svgWidth = Math.max(80, width);
  const svgHeight = 28;
  const lineY = 12;
  const extHeight = 14;

  return (
    <div
      className="absolute bottom-full left-1/2 -translate-x-1/2 z-20 flex flex-col items-center select-none mb-1.5"
      style={{ width: svgWidth, height: 32 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* CAD Dimension SVG Line */}
      <svg
        width={svgWidth}
        height={svgHeight}
        className="overflow-visible pointer-events-none absolute top-0 left-0"
      >
        <defs>
          <marker
            id={`arrow-start-${material.id}`}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#000000" />
          </marker>
          <marker
            id={`arrow-end-${material.id}`}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#000000" />
          </marker>
        </defs>

        {/* Left Extension Line */}
        <line
          x1={2}
          y1={lineY - 4}
          x2={2}
          y2={lineY + extHeight}
          stroke="#000000"
          strokeWidth="1"
        />

        {/* Right Extension Line */}
        <line
          x1={svgWidth - 2}
          y1={lineY - 4}
          x2={svgWidth - 2}
          y2={lineY + extHeight}
          stroke="#000000"
          strokeWidth="1"
        />

        {/* Horizontal Dimension Line with Arrows */}
        <line
          x1={4}
          y1={lineY}
          x2={svgWidth - 4}
          y2={lineY}
          stroke="#000000"
          strokeWidth="1"
          markerStart={`url(#arrow-start-${material.id})`}
          markerEnd={`url(#arrow-end-${material.id})`}
        />
      </svg>

      {/* Dimension & Stacked Tolerance Text Block */}
      <div
        className={`group absolute top-0 z-10 flex items-center gap-1 cursor-pointer bg-white px-1.5 py-0.5 rounded border transition-all ${
          isEditing
            ? 'border-blue-500 ring-2 ring-blue-100 shadow-sm'
            : 'border-transparent hover:border-slate-300 hover:bg-slate-50 shadow-2xs'
        }`}
        style={{
          transform: 'translateY(1px)',
        }}
        onClick={() => setIsEditing((prev) => !prev)}
        title="点击修改线材尺寸标注与公差"
      >
        {/* Left: Length Number (Unit 'mm' is omitted) */}
        <span className="text-xs font-bold font-mono tracking-tight text-black leading-none">
          {dimInfo.lengthDisplay}
        </span>

        {/* Right: Stacked Tolerances (Upper and Lower in single baseline block) */}
        <div className="flex flex-col text-[8.5px] font-semibold font-mono leading-[1.05] tracking-tight text-slate-800">
          <span className="leading-tight">{dimInfo.upper}</span>
          <span className="leading-tight">{dimInfo.lower}</span>
        </div>

        {/* Hover Edit Icon */}
        <Edit2 className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
      </div>

      {/* Popover Editor Dialog */}
      {isEditing && (
        <div
          ref={popoverRef}
          className="absolute top-8 z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl font-sans text-xs text-slate-800"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2.5">
            <span className="font-bold text-slate-700">编辑尺寸与公差</span>
            <button
              type="button"
              onClick={handleResetToDefault}
              className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 hover:underline"
              title="根据长度重新按标准计算公差"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              恢复默认
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                线材长度 (mm)
              </label>
              <input
                type="number"
                min="1"
                value={editLength}
                onChange={(e) => handleLengthChange(Number(e.target.value))}
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  上公差 (如 +10, +2%)
                </label>
                <input
                  type="text"
                  value={editUpper}
                  onChange={(e) => {
                    setEditUpper(e.target.value);
                    setEditIsCustom(true);
                  }}
                  placeholder="+10"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  下公差 (如 -5, -2%)
                </label>
                <input
                  type="text"
                  value={editLower}
                  onChange={(e) => {
                    setEditLower(e.target.value);
                    setEditIsCustom(true);
                  }}
                  placeholder="-5"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Preview text */}
            <div className="rounded bg-slate-50 px-2 py-1.5 border border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">标注预览:</span>
              <div className="flex items-center gap-1 font-mono">
                <span className="text-xs font-bold text-black">{editLength}</span>
                <div className="flex flex-col text-[8.5px] font-semibold leading-[1.05] text-slate-800">
                  <span>{editUpper || '+0'}</span>
                  <span>{editLower || '-0'}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-1.5 pt-1.5">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                <X className="w-3 h-3" />
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 shadow-2xs"
              >
                <Check className="w-3 h-3" />
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
