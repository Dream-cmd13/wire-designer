import { useMemo, type Dispatch, type SetStateAction } from 'react';

export function useMaterialTabPage<Row, State extends { page: number; pageSize: number }>(
  items: readonly Row[],
  state: State,
  setState: Dispatch<SetStateAction<State>>,
  resultsReady: boolean,
) {
  const { page: requestedPage, pageSize } = state;
  const lastPage = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), lastPage);
  const rows = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);

  // 加载期间只约束显示范围，成功取得完整结果后才记住新的页码。
  if (resultsReady && page !== requestedPage) {
    setState({ ...state, page });
  }
  return { page, rows };
}
