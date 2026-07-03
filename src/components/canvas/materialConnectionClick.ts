import type { ConnectorSide, MaterialEndpoint } from '@/types/harness';

export type MaterialConnectionPoint =
  | {
      kind: 'material';
      materialId: string;
      endpoint: MaterialEndpoint;
    }
  | {
      kind: 'connector';
      connectorId: string;
      connectorSide: ConnectorSide;
      pin: number;
    };

let pointClickHandler: ((point: MaterialConnectionPoint) => void) | null = null;

export function setMaterialConnectionPointHandler(
  handler: ((point: MaterialConnectionPoint) => void) | null,
): void {
  pointClickHandler = handler;
}

export function selectMaterialConnectionPoint(point: MaterialConnectionPoint): void {
  pointClickHandler?.(point);
}
