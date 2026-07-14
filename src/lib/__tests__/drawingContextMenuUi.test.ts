import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../components/drawings/standalone/DrawingCanvasContextMenu.tsx', import.meta.url), 'utf8');

describe('drawing canvas context menu UI contract', () => {
  it('renders every required action with icon-led menu buttons', () => {
    for (const label of ['粘贴', '复制', '删除', '裁剪', '移到顶层', '移到底层', '锁定', '解锁']) {
      expect(source).toContain(label);
    }
    for (const icon of ['ClipboardPaste', 'Copy', 'Trash2', 'Scissors', 'BringToFront', 'SendToBack', 'Lock', 'Unlock']) {
      expect(source).toContain(icon);
    }
    expect(source).toContain('role="menu"');
    expect(source).toContain('role="menuitem"');
    expect(source).toContain('items-center gap-2');
  });

  it('closes for outside pointer, Escape, resize, and scroll events', () => {
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("window.addEventListener('resize'");
    expect(source).toContain("window.addEventListener('scroll'");
    expect(source).toContain("document.addEventListener('pointerdown'");
  });
});
