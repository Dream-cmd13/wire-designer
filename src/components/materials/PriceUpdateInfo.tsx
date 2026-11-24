import type { MaterialPrice } from '@/repositories/priceRepository';

const formatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function PriceUpdateInfo({ price, field }: { price?: MaterialPrice; field?: 'time' | 'user' }) {
  if (!price) return field ? <span className="text-slate-400">—</span> : null;
  const date = price.updatedAt ? new Date(price.updatedAt) : null;
  const hasTime = Boolean(date && Number.isFinite(date.getTime()));
  const time = hasTime ? formatter.format(date!) : '未记录';
  const userText = price.updatedByName || price.updatedBy || '';
  if (field === 'time') {
    return (
      <span className={hasTime ? 'tabular-nums text-slate-600' : 'text-slate-400'} title="北京时间（UTC+8）">
        {time}
      </span>
    );
  }
  if (field === 'user') {
    return (
      <span className={`break-all ${userText ? 'text-slate-700' : 'text-slate-400'}`} title={price.updatedBy ?? undefined}>
        {userText || '未记录'}
      </span>
    );
  }
  return <div className="mt-1 text-left text-[11px] font-normal leading-4 text-slate-500">
    <p>价格更新时间：<span className={hasTime ? 'tabular-nums' : 'text-slate-400'} title="北京时间（UTC+8）">{time}</span></p>
    <p className="break-all">价格更新人：<span className={userText ? undefined : 'text-slate-400'} title={price.updatedBy ?? undefined}>{userText || '未记录'}</span></p>
  </div>;
}
