import { useMemo } from 'react';
import { WIRE_GAUGES } from '@/lib/data';

interface WireModelProps {
  points: [number, number, number][];
  wireGauge: number;
  wireColor: string;
}

export function WireModel({ points, wireGauge, wireColor }: WireModelProps) {
  const geometry = useMemo(() => {
    // Compute a smooth quadratic bezier path through the points
    if (points.length < 2) return '';
    const [start, ...rest] = points;
    const end = rest[rest.length - 1];
    const mid = rest.length > 0 ? rest[Math.floor(rest.length / 2)] : [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2 + 1,
      (start[2] + end[2]) / 2,
    ];
    const s = start;
    const m = mid;
    const e = end;
    // Simple quadratic bezier in SVG path format (projected to 2D)
    return `M ${s[0]},${s[2]} Q ${m[0]},${m[2]} ${e[0]},${e[2]}`;
  }, [points]);

  const gauge = WIRE_GAUGES.find((g) => g.awg === wireGauge);
  const strokeWidth = Math.max(1, (gauge?.diameterMm || 0.4) * 2);

  return (
    <path
      d={geometry}
      fill="none"
      stroke={wireColor}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  );
}
