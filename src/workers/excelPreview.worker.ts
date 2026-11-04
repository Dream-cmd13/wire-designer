import * as XLSX from 'xlsx';

export interface ExcelPreviewWorkerRequest {
  buffer: ArrayBuffer;
}

export type ExcelPreviewWorkerResponse =
  | { ok: true; workbook: XLSX.WorkBook }
  | { ok: false; error: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ExcelPreviewWorkerRequest>) => void) | null;
  postMessage: (message: ExcelPreviewWorkerResponse) => void;
};

// 成本分析表解析在 Worker 中执行，避免大文件解析阻塞主线程。
workerScope.onmessage = (event) => {
  try {
    const workbook = XLSX.read(event.data.buffer, {
      type: 'array',
      cellFormula: true,
      cellStyles: true,
      bookFiles: true,
    });
    workerScope.postMessage({ ok: true, workbook });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
