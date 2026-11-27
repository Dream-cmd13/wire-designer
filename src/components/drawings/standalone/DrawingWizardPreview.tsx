import { getDrawingWireColorHex } from '@/lib/drawingGenerator';
import type { DrawingExternalTailStyle, DrawingInternalWireStyle, DrawingWizardDraft } from '@/types/drawing';

export type WizardSlotTarget =
  | { kind: 'left-connector' }
  | { kind: 'right-connector' }
  | { kind: 'ferrite'; index: number }
  | { kind: 'tail-clamp' };

interface DrawingWizardPreviewProps {
  mode: 'internal' | 'external';
  draft: DrawingWizardDraft;
  hasCustomLeftConnector: boolean;
  hasCustomRightConnector: boolean;
  onSelectSlot?: (slot: WizardSlotTarget) => void;
  onChangeTailSpacing?: (spacingPx: number) => void;
  onChangeTailWidth?: (widthPx: number) => void;
}

const INTERNAL_STYLE_LABELS: Record<DrawingInternalWireStyle, string> = {
  normal: '普通线',
  shielded: '屏蔽线',
  twisted: '双绞线',
  ribbon: '排线',
};

const EXTERNAL_STYLE_LABELS: Record<DrawingExternalTailStyle, string> = {
  'double-connector': '双头连接器',
  'single-tinned': '单头尾部上锡',
  'single-crimped': '单头尾部打端',
};

function SlotButton({
  label,
  subLabel,
  xPercent,
  yPercent,
  widthPx = 68,
  heightPx = 46,
  selected,
  onClick,
}: {
  label: string;
  subLabel?: string;
  xPercent: number;
  yPercent: number;
  widthPx?: number;
  heightPx?: number;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        width: widthPx,
        height: heightPx,
        transform: 'translate(-50%, -50%)',
      }}
      className={`group absolute flex flex-col items-center justify-center rounded-md border border-dashed px-1.5 text-center transition ${
        selected
          ? 'border-blue-500 bg-blue-50/80 text-blue-700 shadow-xs'
          : 'border-blue-300 bg-slate-50/90 text-slate-600 hover:border-blue-500 hover:bg-blue-50'
      }`}
    >
      <span className="absolute -top-2 right-1 rounded bg-blue-500 px-1 py-0.5 text-[9px] leading-none text-white shadow-xs">
        点击更换
      </span>
      <span className="max-w-full truncate text-[10px] font-medium leading-tight">{label}</span>
      {subLabel && <span className="max-w-full truncate text-[9px] text-slate-400">{subLabel}</span>}
    </button>
  );
}

export function DrawingWizardPreview({
  mode,
  draft,
  hasCustomLeftConnector,
  hasCustomRightConnector,
  onSelectSlot,
  onChangeTailSpacing,
  onChangeTailWidth,
}: DrawingWizardPreviewProps) {
  if (mode === 'internal') {
    const wireStyle = draft.internalWireStyle ?? 'normal';
    const wireCount = Math.max(1, draft.wires.length);
    const wireGap = wireCount <= 6 ? 18 : Math.max(8, Math.floor(108 / wireCount));
    const wireThickness = wireCount <= 6 ? 10 : Math.max(4, Math.floor(54 / wireCount));
    const totalWireSpan = (wireCount - 1) * wireGap;
    const startY = 100 - totalWireSpan / 2;
    const tinLength = draft.tinningLengthMm ?? 0;
    const showLeftTerminal = hasCustomLeftConnector;
    const showRightTerminal = hasCustomRightConnector;
    const lineStartX = showLeftTerminal ? 120 : 72;
    const lineEndX = showRightTerminal ? 480 : 528;

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <h4 className="text-xs font-semibold text-slate-800">实时预览</h4>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-600">
            {INTERNAL_STYLE_LABELS[wireStyle]}
          </span>
        </div>

        <div
          className="flex h-52 items-center justify-center rounded-lg border border-slate-100 bg-slate-50/70 p-4"
          style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '14px 14px' }}
        >
          <div className="flex h-full w-full max-w-md items-center justify-center rounded-lg bg-white p-3 shadow-xs">
            <svg viewBox="0 0 600 200" className="h-full w-full" aria-label="内线实时预览">
              {showLeftTerminal && (
                <g>
                  <rect x="34" y="42" width="86" height="116" rx="4" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
                  <text x="77" y="96" textAnchor="middle" fontSize="11" fill="#1e293b">P1</text>
                  <text x="77" y="114" textAnchor="middle" fontSize="9" fill="#64748b">
                    {(draft.leftConnector?.name ?? '左端子').slice(0, 10)}
                  </text>
                </g>
              )}
              {showRightTerminal && (
                <g>
                  <rect x="480" y="42" width="86" height="116" rx="4" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
                  <text x="523" y="96" textAnchor="middle" fontSize="11" fill="#1e293b">P2</text>
                  <text x="523" y="114" textAnchor="middle" fontSize="9" fill="#64748b">
                    {(draft.rightConnector?.name ?? '右端子').slice(0, 10)}
                  </text>
                </g>
              )}
              {draft.wires.map((wire, index) => {
                const y = startY + index * wireGap;
                const hex = getDrawingWireColorHex(wire.color) ?? '#111827';
                const isLight = hex === '#ffffff' || hex === '#f5f5f5';
                return (
                  <g key={wire.pin}>
                    {isLight && (
                      <line
                        x1={lineStartX}
                        y1={y}
                        x2={lineEndX}
                        y2={y}
                        stroke="#94a3b8"
                        strokeWidth={wireThickness + 2}
                        strokeLinecap="butt"
                      />
                    )}
                    <line
                      x1={lineStartX}
                      y1={y}
                      x2={lineEndX}
                      y2={y}
                      stroke={hex}
                      strokeWidth={wireThickness}
                      strokeLinecap="butt"
                    />
                    {tinLength > 0 && !showRightTerminal && (
                      <>
                        <rect x={lineEndX} y={y - wireThickness / 2.6} width={16} height={wireThickness / 1.3} fill="#cbd5e1" stroke="#64748b" strokeWidth="0.7" />
                        {draft.halfStrip && (
                          <rect x={lineEndX + 16} y={y - wireThickness / 2} width={10} height={wireThickness} fill={hex} stroke="#475569" strokeWidth="0.6" />
                        )}
                      </>
                    )}
                    {wireStyle === 'twisted' && index % 2 === 1 && (
                      <path
                        d={`M ${lineStartX + 40} ${y - wireGap / 2} Q ${(lineStartX + lineEndX) / 2} ${y - wireGap} ${lineEndX - 40} ${y - wireGap / 2}`}
                        fill="none"
                        stroke="#64748b"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                    )}
                  </g>
                );
              })}
              {wireStyle === 'shielded' && (
                <rect
                  x={lineStartX + 18}
                  y={startY - wireThickness}
                  width={lineEndX - lineStartX - 36}
                  height={totalWireSpan + wireThickness * 2}
                  rx="6"
                  fill="none"
                  stroke="#64748b"
                  strokeDasharray="5 3"
                  strokeWidth="1.2"
                />
              )}
            </svg>
          </div>
        </div>

        <p className="mt-2.5 text-[11px] text-slate-500">
          {INTERNAL_STYLE_LABELS[wireStyle]} · PIN {wireCount} · {tinLength > 0 ? `上锡 ${tinLength}mm` : '不上锡'} · 间距 {wireGap} · 粗细 {wireThickness}
        </p>
      </div>
    );
  }

  // External cable live schematic preview (Images 3, 5, 6)
  const tailStyle: DrawingExternalTailStyle = draft.externalTailStyle ?? 'double-connector';
  const leftCount = Math.max(1, draft.leftConnectorCount ?? 1);
  const rightCount = Math.max(1, draft.rightConnectorCount ?? 1);
  const tailCount = Math.max(1, draft.tailCount ?? 1);
  const ferriteCount = draft.ferriteCount ?? 0;
  const mainWidth = Math.max(4, Math.min(28, draft.mainWireWidthPx ?? 14));
  const tailSpacing = Math.max(6, Math.min(40, draft.tailWireSpacingPx ?? 20));
  const tailWireWidth = Math.max(2, Math.min(18, draft.tailWireWidthPx ?? 8));
  const showRightConnectorSlots = tailStyle !== 'single-tinned';
  const slotCount = 1 + (showRightConnectorSlots ? 1 : 0) + ferriteCount + (tailStyle !== 'double-connector' && draft.hasTailClamp ? 1 : 0);

  const leftConnectorLabel = hasCustomLeftConnector
    ? (draft.leftConnector?.name ?? '连接器')
    : '连接器';
  const rightConnectorLabel = hasCustomRightConnector
    ? (draft.rightConnector?.name ?? '插头')
    : (tailStyle === 'double-connector' ? '插头' : '连接器');

  const fanWireCount = Math.min(8, Math.max(2, draft.wires.length || draft.tailCoreCount || 4));
  const fanSpan = Math.min(82, (fanWireCount - 1) * Math.min(14, tailSpacing * 0.6));
  const fanStartY = 140 - fanSpan / 2;

  const summaryText = tailStyle === 'double-connector'
    ? `左 ${leftCount} 连接器 → ${rightCount} 个连接器 连接器 ${rightCount} 个(不露线)`
    : tailStyle === 'single-tinned'
      ? `左 ${leftCount} 连接器 → 线尾 ${fanWireCount} 芯 线尾 ${tailCount} 芯(末端上锡)`
      : `左 ${leftCount} 连接器 → 连接器 ${rightCount} 个 共 ${fanWireCount} 芯(由连接器 Pin 数决定)`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <h4 className="text-xs font-semibold text-slate-800">实时预览</h4>
        </div>
        <span className="text-[11px] text-slate-400">
          {EXTERNAL_STYLE_LABELS[tailStyle]} · 点蓝色虚线框换型号 · 共 {slotCount} 个槽位
        </span>
      </div>

      <div className="mb-2.5 inline-block rounded-md bg-blue-50 px-2.5 py-1 text-[11px] text-blue-600">
        点预览里的蓝色虚线框(右上角有「点击更换」)，即可更换型号
      </div>

      <div className="relative h-64 w-full overflow-hidden rounded-lg border border-slate-100 bg-white">
        <svg viewBox="0 0 640 260" className="h-full w-full" aria-label="外线实时预览">
          {/* P1 label */}
          <text x="26" y="145" fontSize="13" fontWeight="700" fill="#1e293b">P1</text>

          {/* Optional top-view box */}
          {draft.hasTopView && (
            <g>
              <rect x="52" y="182" width="66" height="32" rx="3" fill="#f8fafc" stroke="#64748b" strokeDasharray="3 2" strokeWidth="1" />
              <text x="85" y="202" textAnchor="middle" fontSize="9" fill="#64748b">俯视图</text>
            </g>
          )}

          {/* Main cable body */}
          <rect
            x="118"
            y={140 - mainWidth / 2}
            width={tailStyle === 'double-connector' ? 396 : 332}
            height={mainWidth}
            fill="#ffffff"
            stroke="#1e293b"
            strokeWidth="1.5"
          />

          {/* Break symbol + item balloon (1) */}
          <g transform="translate(275, 140)">
            <rect x="-8" y={-mainWidth / 2 - 4} width="16" height={mainWidth + 8} fill="#ffffff" />
            <path d={`M -6 ${-mainWidth / 2 - 4} C -2 ${-mainWidth / 4}, -10 ${mainWidth / 4}, -6 ${mainWidth / 2 + 4}`} fill="none" stroke="#1e293b" strokeWidth="1.3" />
            <path d={`M 4 ${-mainWidth / 2 - 4} C 8 ${-mainWidth / 4}, 0 ${mainWidth / 4}, 4 ${mainWidth / 2 + 4}`} fill="none" stroke="#1e293b" strokeWidth="1.3" />
            <line x1="12" y1={mainWidth / 2} x2="26" y2={mainWidth / 2 + 16} stroke="#475569" strokeWidth="1" />
            <circle cx="32" cy={mainWidth / 2 + 20} r="7" fill="#ffffff" stroke="#334155" strokeWidth="1" />
            <text x="32" y={mainWidth / 2 + 23.5} textAnchor="middle" fontSize="9" fill="#1e293b">1</text>
          </g>

          {/* Heat shrink sleeve at branch root */}
          {tailStyle !== 'double-connector' && draft.hasProtectiveSleeve && (
            <rect
              x="442"
              y={140 - mainWidth / 2 - 3}
              width="14"
              height={mainWidth + 6}
              rx="2"
              fill="#334155"
            />
          )}

          {/* Fanned tail cores for single-tinned or single-crimped */}
          {tailStyle !== 'double-connector' && (
            <g>
              {Array.from({ length: fanWireCount }, (_, index) => {
                const targetY = fanStartY + index * (fanWireCount > 1 ? fanSpan / (fanWireCount - 1) : 0);
                const wire = draft.wires[index];
                const hex = getDrawingWireColorHex(wire?.color ?? '') ?? '#111827';
                const branchEndX = tailStyle === 'single-tinned' ? 535 : 514;
                return (
                  <g key={index}>
                    <path
                      d={`M 450 140 C 472 140, 480 ${targetY}, ${branchEndX} ${targetY}`}
                      fill="none"
                      stroke={hex === '#ffffff' ? '#475569' : hex}
                      strokeWidth={Math.max(2, Math.min(6, tailWireWidth * 0.5))}
                    />
                    {tailStyle === 'single-tinned' && (
                      <>
                        <rect
                          x={branchEndX}
                          y={targetY - 2.5}
                          width="12"
                          height="5"
                          fill="#cbd5e1"
                          stroke="#64748b"
                          strokeWidth="0.7"
                        />
                        {draft.halfStrip && (
                          <rect
                            x={branchEndX + 12}
                            y={targetY - 2.5}
                            width="8"
                            height="5"
                            fill={hex}
                            stroke="#475569"
                            strokeWidth="0.6"
                          />
                        )}
                      </>
                    )}
                  </g>
                );
              })}

              {/* 25mm strip dimension */}
              <line x1="450" y1="64" x2="450" y2="128" stroke="#64748b" strokeWidth="1" />
              <line x1="535" y1="64" x2="535" y2={fanStartY - 8} stroke="#64748b" strokeWidth="1" />
              <line x1="450" y1="74" x2="535" y2="74" stroke="#334155" strokeWidth="1.2" />
              <text x="492.5" y="69" textAnchor="middle" fontSize="10" fontWeight="600" fill="#1e293b">25mm</text>

              {tailStyle === 'single-tinned' && (
                <>
                  <line x1="535" y1={fanStartY + fanSpan + 8} x2="535" y2="212" stroke="#64748b" strokeWidth="1" />
                  <line x1="547" y1={fanStartY + fanSpan + 8} x2="547" y2="212" stroke="#64748b" strokeWidth="1" />
                  <line x1="520" y1="204" x2="564" y2="204" stroke="#334155" strokeWidth="1" />
                  <text x="567" y="207" fontSize="10" fontWeight="600" fill="#1e293b">5mm</text>
                </>
              )}
            </g>
          )}

          {/* P2 label */}
          {showRightConnectorSlots && (
            <text x="602" y="145" fontSize="13" fontWeight="700" fill="#1e293b">P2</text>
          )}
        </svg>

        {/* Interactive Click-to-Replace Blue Dashed Slots */}
        <SlotButton
          label={leftConnectorLabel}
          subLabel={leftCount > 1 ? `×${leftCount}` : undefined}
          xPercent={14}
          yPercent={54}
          widthPx={70}
          heightPx={46}
          selected={hasCustomLeftConnector}
          onClick={() => onSelectSlot?.({ kind: 'left-connector' })}
        />

        {Array.from({ length: ferriteCount }, (_, idx) => (
          <SlotButton
            key={`ferrite-${idx}`}
            label={draft.ferriteResources?.[idx]?.name ?? `磁环${ferriteCount > 1 ? idx + 1 : ''}`}
            xPercent={ferriteCount === 1 ? 33 : 28 + idx * 14}
            yPercent={54}
            widthPx={60}
            heightPx={42}
            selected={Boolean(draft.ferriteResources?.[idx])}
            onClick={() => onSelectSlot?.({ kind: 'ferrite', index: idx })}
          />
        ))}

        {tailStyle !== 'double-connector' && draft.hasTailClamp && (
          <SlotButton
            label={draft.tailClampResource?.name ?? '线尾卡位'}
            xPercent={66}
            yPercent={54}
            widthPx={62}
            heightPx={42}
            selected={Boolean(draft.tailClampResource)}
            onClick={() => onSelectSlot?.({ kind: 'tail-clamp' })}
          />
        )}

        {showRightConnectorSlots && (
          <SlotButton
            label={rightConnectorLabel}
            subLabel={rightCount > 1 ? `×${rightCount}` : undefined}
            xPercent={86}
            yPercent={54}
            widthPx={70}
            heightPx={46}
            selected={hasCustomRightConnector}
            onClick={() => onSelectSlot?.({ kind: 'right-connector' })}
          />
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{summaryText}</span>
        {tailStyle !== 'double-connector' && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5">
              <span>尾部线间距</span>
              <input
                type="number"
                min={6}
                max={40}
                value={tailSpacing}
                onChange={(event) => onChangeTailSpacing?.(Math.max(6, Number(event.target.value) || 20))}
                className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-center text-xs text-slate-700 outline-none focus:border-blue-500"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span>尾部线宽度</span>
              <input
                type="number"
                min={2}
                max={18}
                value={tailWireWidth}
                onChange={(event) => onChangeTailWidth?.(Math.max(2, Number(event.target.value) || 8))}
                className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-center text-xs text-slate-700 outline-none focus:border-blue-500"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
