-- Update only length-based finishing prices; preserve all other pricing parameters.
begin;
create or replace function public.save_pricing_settings(expected_version integer, new_settings jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare k text; v text; next_version integer; tier text; tier_rates jsonb;
begin
  if not public.can_manage_pricing() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(new_settings) is distinct from 'object'
    or jsonb_typeof(new_settings->'laborRates') is distinct from 'object'
    or jsonb_typeof(new_settings->'finishingLaborRates') is distinct from 'object' then raise exception 'Invalid settings'; end if;
  if (select count(*) from jsonb_object_keys(new_settings)) <> 6
    or (select count(*) from jsonb_object_keys(new_settings->'laborRates')) <> 7
    or (select count(*) from jsonb_object_keys(new_settings->'finishingLaborRates')) <> 5 then raise exception 'Invalid settings fields'; end if;
  foreach k in array array['materialLossRate','processingLossRate','marginRate','freightRate'] loop
    v := new_settings->>k;
    if jsonb_typeof(new_settings->k) is distinct from 'string' or v !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$' then raise exception 'Invalid rate'; end if;
    if v::numeric >= 1 then raise exception 'Invalid rate'; end if;
  end loop;
  foreach k in array array['裁线','去皮','去外皮','处理编织','热缩编织','焊接','成型'] loop
    v := new_settings->'laborRates'->>k;
    if jsonb_typeof(new_settings->'laborRates'->k) is distinct from 'string' or v !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$' then raise exception 'Invalid labor rate'; end if;
  end loop;
  foreach tier in array array['500','1000','2000','3000','5000'] loop
    tier_rates := new_settings->'finishingLaborRates'->tier;
    if jsonb_typeof(tier_rates) is distinct from 'object' then raise exception 'Invalid finishing tier'; end if;
    if (select count(*) from jsonb_object_keys(tier_rates)) <> 3 then raise exception 'Invalid finishing fields'; end if;
    foreach k in array array['电测','外观','包装人工'] loop
      v := tier_rates->>k;
      if jsonb_typeof(tier_rates->k) is distinct from 'string' or v !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$' then raise exception 'Invalid finishing rate'; end if;
    end loop;
  end loop;
  update public.pricing_settings set settings = new_settings - 'version', version = version + 1,
    updated_at = now(), updated_by = auth.uid() where id = 1 and version = expected_version
    returning version into next_version;
  if next_version is null then raise exception '参数已被其他用户修改，请刷新后重试'; end if;
  return next_version;
end $$;
revoke all on function public.save_pricing_settings(integer,jsonb) from public, anon;
grant execute on function public.save_pricing_settings(integer,jsonb) to authenticated;


update public.pricing_settings
set settings = jsonb_set(settings, '{laborRates}', (settings->'laborRates') - '电测' - '外观' - '包装人工')
    || jsonb_build_object('finishingLaborRates', '{"500":{"电测":"0.05","外观":"0.05","包装人工":"0.05"},"1000":{"电测":"0.10","外观":"0.20","包装人工":"0.10"},"2000":{"电测":"0.10","外观":"0.20","包装人工":"0.20"},"3000":{"电测":"0.10","外观":"0.20","包装人工":"0.20"},"5000":{"电测":"0.10","外观":"0.20","包装人工":"0.30"}}'::jsonb),
    version = version + 1, updated_at = now(), updated_by = null
where id = 1 and not (settings ? 'finishingLaborRates');
commit;
