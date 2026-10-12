-- Preserve all other parameters and existing business data.
begin;
update public.pricing_settings
set settings = jsonb_set(settings, '{laborRates,去外皮}', '"0.05"'::jsonb),
    version = version + 1, updated_at = now(), updated_by = null
where id = 1 and settings->'laborRates'->>'去外皮' = '0.02';
commit;
