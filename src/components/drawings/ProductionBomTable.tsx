import { DRAWING_FONT_FAMILY } from '@/lib/drawingFont';
import type { ProductionBomRow } from '@/lib/productionBomRows';
import type { ProductionDrawingLayout } from '@/lib/productionDrawingLayout';
import type { TwoDImage } from '@/types/harness';

function SlashHeaderCell({
  topText,
  bottomText,
  width,
}: {
  topText: string;
  bottomText: string;
  width: string;
}) {
  return (
    <div
      className="relative h-[36px] flex items-center justify-center border-r border-black select-none shrink-0"
      style={{ width }}
    >
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <line x1="0" y1="100%" x2="100%" y2="0" stroke="black" strokeWidth="1" />
      </svg>
      <span className="absolute top-[2px] left-[4px] text-[9px] font-bold leading-none scale-90 origin-top-left">
        {topText}
      </span>
      <span className="absolute bottom-[2px] right-[4px] text-[8px] font-bold leading-none scale-90 origin-bottom-right">
        {bottomText}
      </span>
    </div>
  );
}

export function BOMTable({
  rows,
  layout,
  highlightedRowKey,
  onHoverRowKey,
  onClickRowKey,
  twoDImages,
}: {
  rows: ProductionBomRow[];
  layout: ProductionDrawingLayout;
  highlightedRowKey?: string | null;
  onHoverRowKey?: (key: string | null) => void;
  onClickRowKey?: (key: string | null) => void;
  twoDImages?: TwoDImage[];
}) {
  const circledNums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  const sortedRows = [...rows].sort((a, b) => b.itemNo - a.itemNo);

  return (
    <div
      className="absolute bg-white border border-black text-black select-none shadow-sm font-serif z-20"
      style={{
        bottom: layout.bom.bottom,
        right: layout.bom.right,
        width: layout.bom.width,
        fontFamily: DRAWING_FONT_FAMILY,
        boxSizing: 'border-box',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col">
        {sortedRows.map((row) => {
          const isHighlighted = highlightedRowKey === row.key;
          const hasImage = !twoDImages || twoDImages.length === 0 || row.targets.some((t) =>
            twoDImages.some((img) => img.elementKind === t.kind && img.elementId === t.id),
          );

          return (
            <div
              key={row.key}
              className={`flex flex-row border-b border-black items-stretch text-[10px] font-semibold min-h-[34px] cursor-pointer transition-colors ${
                isHighlighted ? 'bg-blue-50/90' : 'hover:bg-slate-50'
              }`}
              onMouseEnter={() => onHoverRowKey?.(row.key)}
              onMouseLeave={() => onHoverRowKey?.(null)}
              onClick={() => onClickRowKey?.(isHighlighted ? null : row.key)}
            >
              <div className={`w-[45px] border-r border-black flex items-center justify-center text-xs font-bold shrink-0 self-stretch ${isHighlighted ? 'text-blue-700 font-extrabold' : ''}`}>
                {circledNums[row.itemNo - 1] || row.itemNo}
              </div>
              <div className="w-[65px] border-r border-black flex items-center justify-center text-[11px] shrink-0 self-stretch">
                {row.name}
              </div>
              <div className="flex-1 border-r border-black flex items-center justify-between px-3 py-1.5 whitespace-pre-line leading-[14px] text-[10px] break-words self-stretch">
                <span>{row.specification}</span>
                {!hasImage && (
                  <span
                    className="ml-1.5 px-1 py-0.5 text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded shrink-0 select-none"
                    title="该物料在画布上暂无2D对应图片"
                  >
                    无2D图
                  </span>
                )}
              </div>
              <div className="w-[45px] border-r border-black flex items-center justify-center text-[11px] shrink-0 self-stretch">
                {row.unit}
              </div>
              <div className="w-[45px] flex items-center justify-center text-xs font-bold shrink-0 self-stretch">
                {row.quantity}
              </div>
            </div>
          );
        })}

        <div
          className="flex flex-row text-[10px] font-bold"
          style={{ height: layout.bom.headerHeight, backgroundColor: 'rgba(248, 250, 252, 0.5)' }}
        >
          <SlashHeaderCell topText="序号" bottomText="ITEM" width="45px" />
          <SlashHeaderCell topText="名称" bottomText="NAME" width="65px" />
          <div className="flex-1 border-r border-black h-full flex items-center justify-center tracking-wider text-xs">
            规格/NAME&DESCRIPTION
          </div>
          <SlashHeaderCell topText="单位" bottomText="UNIT" width="45px" />
          <SlashHeaderCell topText="用量" bottomText="DSE" width="45px" />
        </div>
      </div>
    </div>
  );
}
