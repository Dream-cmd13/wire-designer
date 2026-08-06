-- Idempotent migration of frontend quotation and material options.
-- These rows replace the former frontend business constants.

begin;

insert into public.lead_time_options
  (code, display_name, display_days, multiplier, display_order)
values
  ('rush', '加急', '10个工作日', 1.3, 10),
  ('standard', '标准', '20-30个工作日', 1.0, 20),
  ('economy', '经济', '30-50个工作日', 0.9, 30)
on conflict (code) where deleted_at is null do update set
  display_name = excluded.display_name,
  display_days = excluded.display_days,
  multiplier = excluded.multiplier,
  display_order = excluded.display_order,
  is_active = true,
  deleted_at = null,
  updated_at = now();

insert into public.protection_options
  (code, display_name, price_per_meter, material_multipliers, display_order)
values
  ('none', '无', 0, '{}'::jsonb, 10),
  ('acetate-cloth', '醋酸布', 2.2, '{}'::jsonb, 20),
  ('fleece', '绒布', 2.8, '{}'::jsonb, 30),
  ('heat-shrink', '热缩管', 1.67, '{}'::jsonb, 40),
  ('braided', '编织网管', 3.33, '{}'::jsonb, 50),
  ('spiral', '螺旋缠绕管', 0.8, '{}'::jsonb, 60),
  ('convoluted', '波纹管', 1.2, '{}'::jsonb, 70),
  ('corrugated', '波纹管（可选材质）', 4.0, '{"PP":1.0,"PA":1.4,"stainless-steel":3.2}'::jsonb, 80)
on conflict (code) where deleted_at is null do update set
  display_name = excluded.display_name,
  price_per_meter = excluded.price_per_meter,
  material_multipliers = excluded.material_multipliers,
  display_order = excluded.display_order,
  is_active = true,
  deleted_at = null,
  updated_at = now();

insert into public.pricing_rules (rule_code, rule_key, numeric_value, display_order)
values
  ('connector', 'base', 0.5, 10),
  ('connector', 'per_pin', 0.3, 20),
  ('wire_per_meter', 'awg_22', 2.0, 10),
  ('wire_per_meter', 'awg_24', 1.5, 20),
  ('wire_per_meter', 'awg_26', 1.0, 30),
  ('wire_per_meter', 'awg_28', 0.8, 40),
  ('wire_per_meter', 'awg_30', 0.6, 50),
  ('wire_type_multiplier', 'silicone', 1.5, 10),
  ('wire_type_multiplier', 'ul1007', 1.0, 20),
  ('wire_type_multiplier', 'ul1061', 0.9, 30),
  ('wire_type_multiplier', 'gxl', 1.3, 40),
  ('wire_type_multiplier', 'ptfe', 2.0, 50),
  ('labor', 'per_connector', 2.0, 10),
  ('labor', 'per_meter', 1.5, 20),
  ('jacketed', 'core_factor', 0.6, 10)
on conflict (rule_code, rule_key) where deleted_at is null do update set
  numeric_value = excluded.numeric_value,
  display_order = excluded.display_order,
  is_active = true,
  deleted_at = null,
  updated_at = now();

insert into public.quantity_discount_rules (minimum_quantity, multiplier, display_order)
values
  (1, 1.0, 10),
  (5, 0.95, 20),
  (10, 0.9, 30),
  (20, 0.85, 40),
  (50, 0.8, 50),
  (100, 0.7, 60)
on conflict (minimum_quantity) where deleted_at is null do update set
  multiplier = excluded.multiplier,
  display_order = excluded.display_order,
  is_active = true,
  deleted_at = null,
  updated_at = now();

commit;
