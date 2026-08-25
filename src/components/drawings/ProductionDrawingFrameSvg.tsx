import React from 'react';
import type { ProductionDrawingFrame } from '@/types/harness';

interface ProductionDrawingFrameSvgProps {
  frame: ProductionDrawingFrame;
  onEdit?: (field?: string) => void;
  interactive?: boolean;
}

export const ProductionDrawingFrameSvg: React.FC<ProductionDrawingFrameSvgProps> = ({
  frame,
  onEdit,
  interactive = true,
}) => {
  const handleClick = (field?: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (interactive && onEdit) {
      onEdit(field);
    }
  };

  const interactiveClass = interactive
    ? 'cursor-pointer transition-opacity duration-150 hover:opacity-75'
    : '';

  return (
    <svg
      width="1200"
      height="800"
      viewBox="0 0 1200 800"
      className="absolute top-0 left-0 pointer-events-auto select-none"
      style={{
        fontFamily: 'SimSun, STSong, "Songti SC", "SimHei", "Microsoft YaHei", sans-serif',
      }}
    >
      {/* ── Background & Outer Canvas Border ──────────────────────── */}
      <rect x="0" y="0" width="1200" height="800" fill="#ffffff" />
      <rect x="1" y="1" width="1198" height="798" fill="none" stroke="#000000" strokeWidth="1" />

      {/* ── Inner Drawing Border (1154 x 754) ────────────────────── */}
      <rect x="22" y="22" width="1154" height="754" fill="none" stroke="#000000" strokeWidth="1.5" />

      {/* ── Grid Partitions & Tick Marks ──────────────────────────── */}
      {/* Top and Bottom Horizontal Ruler Numbers (1 - 8) */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const xStart = 22 + i * 144.25;
        const xEnd = xStart + 144.25;
        const xCenter = (xStart + xEnd) / 2;
        return (
          <g key={i}>
            {/* Top tick */}
            {i > 0 && <line x1={xStart} y1="0" x2={xStart} y2="22" stroke="#000" strokeWidth="1" />}
            <text
              x={xCenter}
              y="15"
              textAnchor="middle"
              fontSize="11"
              fontWeight="bold"
              fill="#333"
            >
              {i + 1}
            </text>

            {/* Bottom tick */}
            {i > 0 && <line x1={xStart} y1="776" x2={xStart} y2="800" stroke="#000" strokeWidth="1" />}
            <text
              x={xCenter}
              y="792"
              textAnchor="middle"
              fontSize="11"
              fontWeight="bold"
              fill="#333"
            >
              {i + 1}
            </text>
          </g>
        );
      })}

      {/* Left and Right Vertical Ruler Letters (A - H) */}
      {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((letter, i) => {
        const yStart = 22 + i * 94.25;
        const yEnd = yStart + 94.25;
        const yCenter = (yStart + yEnd) / 2 + 4;
        return (
          <g key={letter}>
            {/* Left tick */}
            {i > 0 && <line x1="0" y1={yStart} x2="22" y2={yStart} stroke="#000" strokeWidth="1" />}
            <text
              x="11"
              y={yCenter}
              textAnchor="middle"
              fontSize="11"
              fontWeight="bold"
              fill="#333"
            >
              {letter}
            </text>

            {/* Right tick */}
            {i > 0 && <line x1="1176" y1={yStart} x2="1200" y2={yStart} stroke="#000" strokeWidth="1" />}
            <text
              x="1188"
              y={yCenter}
              textAnchor="middle"
              fontSize="11"
              fontWeight="bold"
              fill="#333"
            >
              {letter}
            </text>
          </g>
        );
      })}

      {/* ── Top-Left Compliance Note Box ──────────────────────────── */}
      <g
        className={interactiveClass}
        onClick={handleClick('complianceNote')}
       
      >
        <title>点击编辑技术要求说明</title>
        <rect
          x="22"
          y="22"
          width="400"
          height="24"
          fill="#ffffff"
          stroke="#000000"
          strokeWidth="1"
        />
        <text
          x="28"
          y="37.5"
          fontSize="9.5"
          fill="#000000"
          letterSpacing="0.2"
        >
          {frame.complianceNote || '该产品的所有材料及加工工艺必须符合 “WL-PZ-001 ” HSF 技术标准的控制要求。'}
        </text>
      </g>

      {/* ── Bottom Title Block & Revisions (y: 667 -> 776) ────────── */}
      <g>
        {/* Outer border of bottom title block */}
        <rect
          x="22"
          y="667"
          width="1154"
          height="109"
          fill="#ffffff"
          stroke="#000000"
          strokeWidth="1.5"
        />

        {/* ── 1. Revision Record Table (x: 22 -> 335, width: 313) ──── */}
        {/* Vertical column lines in rev table */}
        <line x1="68" y1="667" x2="68" y2="776" stroke="#000" strokeWidth="1" />
        <line x1="265" y1="667" x2="265" y2="776" stroke="#000" strokeWidth="1" />
        <line x1="335" y1="667" x2="335" y2="776" stroke="#000" strokeWidth="1.5" />

        {/* Row lines in rev table */}
        {[1, 2, 3, 4].map((idx) => {
          const y = 667 + idx * 21.8;
          return <line key={idx} x1="22" y1={y} x2="335" y2={y} stroke="#000" strokeWidth="1" />;
        })}

        {/* Rev table headers */}
        <text x="45" y="681" textAnchor="middle" fontSize="10" fontWeight="bold">REV.</text>
        <text x="166" y="681" textAnchor="middle" fontSize="10" fontWeight="bold">REVISION RECORD</text>
        <text x="300" y="681" textAnchor="middle" fontSize="10" fontWeight="bold">DATE</text>

        {/* Rev table data rows */}
        {[0, 1, 2, 3].map((rowIdx) => {
          const row = frame.revisionRows?.[rowIdx];
          const yText = 688.8 + rowIdx * 21.8 + 14.5;
          return (
            <g
              key={rowIdx}
              className={interactiveClass}
              onClick={handleClick(`revisionRows[${rowIdx}]`)}
             
            >
        <title>点击编辑修订记录</title>
              <text x="45" y={yText} textAnchor="middle" fontSize="10" fontWeight="500">
                {row?.rev || ''}
              </text>
              <text x="166" y={yText} textAnchor="middle" fontSize="10" fontWeight="500">
                {row?.description || ''}
              </text>
              <text x="300" y={yText} textAnchor="middle" fontSize="10" fontWeight="500">
                {row?.date || ''}
              </text>
            </g>
          );
        })}

        {/* ── 2. Projection, Unit, Size (x: 335 -> 395, width: 60) ─── */}
        <line x1="395" y1="667" x2="395" y2="776" stroke="#000" strokeWidth="1" />
        <line x1="335" y1="722" x2="395" y2="722" stroke="#000" strokeWidth="1" />
        <line x1="335" y1="749" x2="395" y2="749" stroke="#000" strokeWidth="1" />

        {/* 3rd Angle Projection Cone Symbol */}
        <g transform="translate(344, 678)">
          {/* Crosshair & Circles */}
          <line x1="0" y1="16" x2="22" y2="16" stroke="#000" strokeWidth="0.75" />
          <line x1="11" y1="5" x2="11" y2="27" stroke="#000" strokeWidth="0.75" />
          <circle cx="11" cy="16" r="5" fill="none" stroke="#000" strokeWidth="0.9" />
          <circle cx="11" cy="16" r="9" fill="none" stroke="#000" strokeWidth="0.9" />

          {/* Cone Projection Trapezoid */}
          <line x1="28" y1="8" x2="43" y2="4" stroke="#000" strokeWidth="1" />
          <line x1="28" y1="24" x2="43" y2="28" stroke="#000" strokeWidth="1" />
          <line x1="28" y1="8" x2="28" y2="24" stroke="#000" strokeWidth="1" />
          <line x1="43" y1="4" x2="43" y2="28" stroke="#000" strokeWidth="1" />
          <line x1="23" y1="16" x2="48" y2="16" stroke="#000" strokeWidth="0.75" strokeDasharray="3 2" />
        </g>

        {/* UNIT & SIZE */}
        <g
          className={interactiveClass}
          onClick={handleClick('unit')}
         
        >
        <title>点击编辑单位与图幅</title>
          <text x="365" y="738" textAnchor="middle" fontSize="9.5" fontWeight="500">
            UNIT: {frame.unit || 'mm'}
          </text>
        </g>
        <g
          className={interactiveClass}
          onClick={handleClick('size')}
         
        >
        <title>点击编辑图幅尺寸</title>
          <text x="365" y="765" textAnchor="middle" fontSize="9.5" fontWeight="500">
            SIZE: {frame.size || 'A4'}
          </text>
        </g>

        {/* ── 3. General Tolerances (x: 395 -> 535, width: 140) ────── */}
        <line x1="535" y1="667" x2="535" y2="776" stroke="#000" strokeWidth="1" />
        <line x1="395" y1="694" x2="535" y2="694" stroke="#000" strokeWidth="1" />
        <line x1="395" y1="714" x2="535" y2="714" stroke="#000" strokeWidth="1" />
        <line x1="395" y1="734" x2="535" y2="734" stroke="#000" strokeWidth="1" />
        <line x1="395" y1="755" x2="535" y2="755" stroke="#000" strokeWidth="1" />
        <line x1="465" y1="694" x2="465" y2="776" stroke="#000" strokeWidth="1" />

        {/* Tolerance Header & Data */}
        <text x="465" y="682" textAnchor="middle" fontSize="9.5" fontWeight="bold">
          GENERAL TOLERANCES
        </text>
        <text x="430" y="707" textAnchor="middle" fontSize="8.5" fontWeight="bold">LINEAR</text>
        <text x="500" y="707" textAnchor="middle" fontSize="8.5" fontWeight="bold">ANGLES</text>

        <text x="430" y="726" textAnchor="middle" fontSize="9">.XX±0.5</text>
        <text x="500" y="726" textAnchor="middle" fontSize="9">X°REF±6°</text>

        <text x="430" y="747" textAnchor="middle" fontSize="9">X.X±0.3</text>
        <text x="500" y="747" textAnchor="middle" fontSize="9">X°±3°</text>

        <text x="430" y="768" textAnchor="middle" fontSize="9">X.XX±0.25</text>
        <text x="500" y="768" textAnchor="middle" fontSize="9">X°X' ±2°</text>

        {/* ── 4. Scale & Approvals (x: 535 -> 720, width: 185) ─────── */}
        <line x1="720" y1="667" x2="720" y2="776" stroke="#000" strokeWidth="1.5" />
        <line x1="535" y1="694" x2="720" y2="694" stroke="#000" strokeWidth="1" />
        <line x1="535" y1="721" x2="720" y2="721" stroke="#000" strokeWidth="1" />
        <line x1="535" y1="748" x2="720" y2="748" stroke="#000" strokeWidth="1" />
        <line x1="595" y1="667" x2="595" y2="776" stroke="#000" strokeWidth="1" />
        <line x1="655" y1="667" x2="655" y2="776" stroke="#000" strokeWidth="1" />

        {/* Scale and Header */}
        <g
          className={interactiveClass}
          onClick={handleClick('scale')}
         
        >
        <title>点击编辑比例</title>
          <text x="565" y="679" textAnchor="middle" fontSize="8" fontWeight="bold">SCALE:</text>
          <text x="565" y="690" textAnchor="middle" fontSize="9" fontWeight="bold">{frame.scale || '1:1'}</text>
        </g>
        <text x="625" y="684" textAnchor="middle" fontSize="9" fontWeight="bold">NAME</text>
        <text x="687" y="684" textAnchor="middle" fontSize="9" fontWeight="bold">DATE</text>

        {/* APPROVED Row */}
        <text x="565" y="711" textAnchor="middle" fontSize="8.5" fontWeight="bold">APPROVED</text>
        <g
          className={interactiveClass}
          onClick={handleClick('approved')}
         
        >
        <title>点击编辑审核人与日期</title>
          <text x="625" y="711" textAnchor="middle" fontSize="9.5" fontWeight="500">
            {frame.approved?.name || ''}
          </text>
          <text x="687" y="711" textAnchor="middle" fontSize="9">
            {frame.approved?.date || ''}
          </text>
        </g>

        {/* DESIGNER Row */}
        <text x="565" y="738" textAnchor="middle" fontSize="8.5" fontWeight="bold">DESIGNER</text>
        <g
          className={interactiveClass}
          onClick={handleClick('designer')}
         
        >
        <title>点击编辑设计人与日期</title>
          <text x="625" y="738" textAnchor="middle" fontSize="9.5" fontWeight="500">
            {frame.designer?.name || ''}
          </text>
          <text x="687" y="738" textAnchor="middle" fontSize="9">
            {frame.designer?.date || ''}
          </text>
        </g>

        {/* DRAWN Row */}
        <text x="565" y="765" textAnchor="middle" fontSize="8.5" fontWeight="bold">DRAWN</text>
        <g
          className={interactiveClass}
          onClick={handleClick('drawn')}
         
        >
        <title>点击编辑制图人与日期</title>
          <text x="625" y="765" textAnchor="middle" fontSize="9.5" fontWeight="500">
            {frame.drawn?.name || ''}
          </text>
          <text x="687" y="765" textAnchor="middle" fontSize="9">
            {frame.drawn?.date || ''}
          </text>
        </g>

        {/* ── 5. Part No & Title (x: 720 -> 920, width: 200) ───────── */}
        <line x1="920" y1="667" x2="920" y2="776" stroke="#000" strokeWidth="1" />
        <line x1="720" y1="722" x2="920" y2="722" stroke="#000" strokeWidth="1" />

        {/* PART.NO */}
        <g
          className={interactiveClass}
          onClick={handleClick('partNo')}
         
        >
        <title>点击编辑料号</title>
          <text x="726" y="680" fontSize="8.5" fontWeight="bold">PART.NO:</text>
          <text
            x="820"
            y="702"
            textAnchor="middle"
            fontSize="12"
            fontWeight="bold"
            letterSpacing="0.3"
          >
            {frame.partNo || ''}
          </text>
        </g>

        {/* TITLE */}
        <g
          className={interactiveClass}
          onClick={handleClick('title')}
         
        >
        <title>点击编辑图纸标题</title>
          <text x="726" y="735" fontSize="8.5" fontWeight="bold">TITLE:</text>
          <text
            x="820"
            y="756"
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            letterSpacing="0.2"
          >
            {frame.title || ''}
          </text>
        </g>

        {/* ── 6. Drawing No & Rev / Sheet (x: 920 -> 1000, width: 80) ─ */}
        <line x1="1000" y1="667" x2="1000" y2="776" stroke="#000" strokeWidth="1.5" />
        <line x1="920" y1="735" x2="1000" y2="735" stroke="#000" strokeWidth="1" />
        <line x1="960" y1="735" x2="960" y2="776" stroke="#000" strokeWidth="1" />

        {/* DWG.NO */}
        <g
          className={interactiveClass}
          onClick={handleClick('drawingNo')}
         
        >
        <title>点击编辑图号</title>
          <text x="926" y="680" fontSize="8.5" fontWeight="bold">DWG.NO:</text>
          <text
            x="960"
            y="708"
            textAnchor="middle"
            fontSize="14"
            fontWeight="bold"
            letterSpacing="0.5"
          >
            {frame.drawingNo || ''}
          </text>
        </g>

        {/* REV & SHEET */}
        <g
          className={interactiveClass}
          onClick={handleClick('revision')}
         
        >
        <title>点击编辑版本</title>
          <text x="940" y="759" textAnchor="middle" fontSize="9" fontWeight="bold">
            REV: {frame.revision || 'X0'}
          </text>
        </g>
        <g
          className={interactiveClass}
          onClick={handleClick('sheet')}
         
        >
        <title>点击编辑页码</title>
          <text x="980" y="759" textAnchor="middle" fontSize="9" fontWeight="bold">
            SHEET: {frame.sheet || '1/1'}
          </text>
        </g>

        {/* ── 7. Company Logo & Name (x: 1000 -> 1176, width: 176) ─── */}
        <g
          className={interactiveClass}
          onClick={handleClick('company')}
         
          transform="translate(1004, 672)"
        >
        <title>万连科技</title>
          {/* WanLian Stylized 'W' Vector Icon */}
          <path
            d="M8,18 L18,52 L27,24 L34,52 L44,18 L34,18 L28,40 L23,24 L16,40 L11,18 Z"
            fill="#000000"
          />

          {/* Chinese Title "万连科技" */}
          <text
            x="50"
            y="42"
            fontSize="22"
            fontWeight="bold"
            letterSpacing="2"
            fill="#000000"
            style={{ fontFamily: '"SimHei", "Microsoft YaHei", sans-serif' }}
          >
            {frame.companyNameCn || '万连科技'}
          </text>

          {/* English Subtitle */}
          <text
            x="8"
            y="65"
            fontSize="8.5"
            letterSpacing="0.4"
            fill="#333333"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            {frame.companyNameEn || 'WanLian Technology Co., Ltd'}
          </text>
        </g>
      </g>
    </svg>
  );
};
