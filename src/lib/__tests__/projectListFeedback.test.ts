import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const projectListSource = readFileSync('src/components/project/ProjectList.tsx', 'utf8');
const appSource = readFileSync('src/App.tsx', 'utf8');

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `缺少片段: ${start}`).toBeGreaterThan(-1);
  expect(endIndex, `缺少片段: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('project list request failure feedback', () => {
  it('reports project export request failures with a retry action', () => {
    const exportSource = sliceBetween(projectListSource, 'const handleExport', 'const handleImport');

    expect(exportSource).toContain('try {');
    expect(exportSource).toContain('catch (error)');
    expect(exportSource).toContain('重试导出');
    expect(exportSource).toContain("getUserErrorMessage(error, '项目导出失败，请检查网络后重试。')");
    expect(exportSource).not.toMatch(/instanceof Error \? .*\.message/);
  });

  it('reports project rename request failures instead of dropping the rejection', () => {
    const renameSource = sliceBetween(projectListSource, 'const saveEdit', 'const handleExport');

    expect(renameSource).toContain('try {');
    expect(renameSource).toContain('catch (error)');
    expect(renameSource).toContain('项目重命名失败');
    expect(renameSource).not.toMatch(/instanceof Error \? .*\.message/);
  });

  it('reports header rename request failures with a retry action', () => {
    const headerRenameSource = sliceBetween(appSource, 'const handleUpdateProjectName', 'const saveStatusLabel');

    expect(headerRenameSource).toContain('.catch((error)');
    expect(headerRenameSource).toContain('重试重命名');
    expect(headerRenameSource).toContain("getUserErrorMessage(error, '项目重命名失败");
    expect(headerRenameSource).not.toMatch(/void updateProject\(/);
  });
});
