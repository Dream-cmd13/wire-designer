import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionToast } from '@/components/shared/ActionToast';
import { DeleteConfirmToast } from '@/components/shared/DeleteConfirmToast';
import { UndoToast } from '@/components/shared/UndoToast';

describe('Toast unified top positioning and backdrop behavior', () => {
  it('renders ActionToast at unified top position by default without backdrop', () => {
    const html = renderToStaticMarkup(
      <ActionToast message="普通状态通知" onClose={() => undefined} />,
    );

    expect(html).toContain('top-6');
    expect(html).toContain('left-1/2');
    expect(html).toContain('animate-toast-in-top');
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

    expect(html).toContain('top-6');
    expect(html).toContain('animate-toast-in-top');
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

  it('renders DeleteConfirmToast at top position with backdrop', () => {
    const html = renderToStaticMarkup(
      <DeleteConfirmToast
        title="确认删除连接器"
        message="此操作不可恢复"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('top-6');
    expect(html).toContain('animate-toast-in-top');
    expect(html).toContain('data-testid="toast-backdrop"');
    expect(html).toContain('确认删除连接器');
  });

  it('renders UndoToast at top position without backdrop to avoid blocking interactions', () => {
    const html = renderToStaticMarkup(
      <UndoToast
        message="已删除 1 个对象"
        canUndo={true}
        onUndo={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('top-6');
    expect(html).toContain('animate-toast-in-top');
    expect(html).not.toContain('toast-backdrop');
    expect(html).toContain('撤销');
    expect(html).toContain('已删除 1 个对象');
  });

  it('stacks multiple notices in one container so they never overlap', () => {
    const html = renderToStaticMarkup(
      <>
        <ActionToast stacked tone="success" message="第一条提示" onClose={() => undefined} />
        <ActionToast
          stacked
          tone="danger"
          message="第二条提示"
          primaryAction={{ label: '重试', onClick: () => undefined }}
          onClose={() => undefined}
        />
      </>,
    );

    expect(html).toContain('第一条提示');
    expect(html).toContain('第二条提示');
    expect(html).toContain('重试');
    expect(html.match(/animate-toast-in /g)).toHaveLength(2);
    expect(html).not.toContain('animate-toast-in-top');
    expect(html).not.toContain('fixed top-6');
  });

  it('routes floating notices through the shared NoticeHost container', () => {
    const hostSource = readFileSync('src/components/shared/NoticeHost.tsx', 'utf8');
    expect(hostSource).toContain('notices.map');
    expect(hostSource).toContain('stacked');
    expect(hostSource).toContain('flex-col');
  });
});
