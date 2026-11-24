// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingManagement } from '@/components/materials/PricingManagement';
import { useUserStore } from '@/stores/userStore';

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: mockSupabase,
}));

const sampleSettings = {
  materialLossRate: '0.03',
  processingLossRate: '0.05',
  marginRate: '0.20',
  freightRate: '0.03',
  laborRates: {
    裁线: '0.05',
    去外皮: '0.05',
    处理编织: '0.10',
    热缩编织: '0.10',
    去皮: '0.05',
    焊接: '0.20',
    成型: '0.20',
    沾锡: '0.05',
  },
  finishingLaborRates: {
    500: { 电测: '0.05', 外观: '0.05', 包装人工: '0.05' },
    1000: { 电测: '0.10', 外观: '0.20', 包装人工: '0.10' },
    2000: { 电测: '0.10', 外观: '0.20', 包装人工: '0.20' },
    3000: { 电测: '0.10', 外观: '0.20', 包装人工: '0.20' },
    5000: { 电测: '0.10', 外观: '0.20', 包装人工: '0.30' },
  },
};

const sampleUsers = [
  { user_id: 'u-admin', email: 'admin@local.app', role: 'admin' },
  { user_id: 'u-sales', email: 'test@local.app', role: 'sales' },
];

describe('PricingManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({
      currentUser: {
        id: 'u-admin',
        name: 'admin',
        email: 'admin@local.app',
        role: 'admin',
        createdAt: 0,
      },
    });
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { version: 4, settings: sampleSettings },
            error: null,
          }),
        }),
      }),
    });
    mockSupabase.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_app_users') return { data: sampleUsers, error: null };
      return { data: null, error: null };
    });
  });

  afterEach(cleanup);

  it('preserves unsaved pricing edits when changing another user role', async () => {
    render(<PricingManagement />);

    fireEvent.click(screen.getByRole('button', { name: '定价参数与用户权限' }));
    await waitFor(() => expect(screen.getByText('版本 4')).toBeTruthy());

    const marginInput = screen.getByLabelText('目标毛利率') as HTMLInputElement;
    fireEvent.change(marginInput, { target: { value: '0.25' } });
    expect(screen.getByText('有未保存修改')).toBeTruthy();

    const roleSelect = screen.getByLabelText('test@local.app角色') as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'engineer' } });

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('角色已更新'));
    expect(roleSelect.value).toBe('engineer');
    // Unsaved pricing edit must NOT be overwritten by role assignment
    expect(marginInput.value).toBe('0.25');
    expect(screen.getByText('有未保存修改')).toBeTruthy();
  });

  it('reports local format validation errors without calling save_pricing_settings', async () => {
    render(<PricingManagement />);

    fireEvent.click(screen.getByRole('button', { name: '定价参数与用户权限' }));
    await waitFor(() => expect(screen.getByText('版本 4')).toBeTruthy());

    const marginInput = screen.getByLabelText('目标毛利率') as HTMLInputElement;
    fireEvent.change(marginInput, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: '保存参数' }));

    expect(screen.getByRole('status').textContent).toContain('参数格式无效');
    expect(mockSupabase.rpc).not.toHaveBeenCalledWith('save_pricing_settings', expect.anything());
  });

  it('closes drawer on Escape and clears stale status when reopened', async () => {
    render(<PricingManagement />);

    const trigger = screen.getByRole('button', { name: '定价参数与用户权限' });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('region', { name: '定价设置' })).toBeTruthy());

    const marginInput = screen.getByLabelText('目标毛利率') as HTMLInputElement;
    fireEvent.change(marginInput, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: '保存参数' }));
    expect(screen.getByRole('status').textContent).toContain('参数格式无效');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: '定价设置' })).toBeNull();

    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('region', { name: '定价设置' })).toBeTruthy());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
