import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionToast } from '@/components/shared/ActionToast';
import { DeleteConfirmToast } from '@/components/shared/DeleteConfirmToast';
import { UndoToast } from '@/components/shared/UndoToast';

describe('Toast unified center-top positioning and backdrop behavior', () => {
  it('renders ActionToast at unified center-top position by default without backdrop', () => {
    const html = renderToStaticMarkup(
      <ActionToast message="普通状态通知" onClose={() => undefined} />,
    );

    expect(html).toContain('top-[35%]');
    expect(html).toContain('left-1/2');
    expect(html).toContain('animate-toast-in-center');
    expect(html).toContain('普通状态通知');
    expect(html).not.toContain('toast-backdrop');
  });

  it('renders ActionToast with backdrop when role is alertdialog', () => {
    const html = renderToStaticMarkup(
      <ActionToast
        role="alertdialog"
        title="确认操作"
        message="是否继续？"
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('top-[35%]');
    expect(html).toContain('animate-toast-in-center');
    expect(html).toContain('data-testid="toast-backdrop"');
    expect(html).toContain('确认操作');
  });

  it('honors explicit backdrop prop over default role behavior', () => {
    const withoutBackdrop = renderToStaticMarkup(
      <ActionToast
        role="alertdialog"
        backdrop={false}
        message="无遮罩模态"
        onClose={() => undefined}
      />,
    );
    expect(withoutBackdrop).not.toContain('toast-backdrop');

    const withBackdrop = renderToStaticMarkup(
      <ActionToast
        role="status"
        backdrop={true}
        message="有遮罩通知"
        onClose={() => undefined}
      />,
    );
    expect(withBackdrop).toContain('data-testid="toast-backdrop"');
  });

  it('renders DeleteConfirmToast at center-top position with backdrop', () => {
    const html = renderToStaticMarkup(
      <DeleteConfirmToast
        title="确认删除连接器"
        message="此操作不可恢复"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('top-[35%]');
    expect(html).toContain('animate-toast-in-center');
    expect(html).toContain('data-testid="toast-backdrop"');
    expect(html).toContain('确认删除连接器');
  });

  it('renders UndoToast at center-top position without backdrop to avoid blocking interactions', () => {
    const html = renderToStaticMarkup(
      <UndoToast
        message="已删除 1 个对象"
        canUndo={true}
        onUndo={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('top-[35%]');
    expect(html).toContain('animate-toast-in-center');
    expect(html).not.toContain('toast-backdrop');
    expect(html).toContain('撤销');
    expect(html).toContain('已删除 1 个对象');
  });
});
