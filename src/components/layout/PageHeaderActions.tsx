import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PageHeaderActionsTarget } from './pageHeaderActionsTarget';

export function PageHeaderActions({ children }: { children: ReactNode }) {
  const target = useContext(PageHeaderActionsTarget);
  if (target === undefined) return children;
  return target ? createPortal(children, target) : null;
}
