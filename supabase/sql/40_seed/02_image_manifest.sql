-- Run after the image files have been uploaded to the listed Storage paths.
-- The primary image is the only image automatically displayed in the product-image view.

insert into public.catalog_item_images (
  id, item_id, storage_path, file_name, mime_type, size_bytes, image_role, is_primary, display_order
) values
  ('20000000-0000-4000-8000-000000008001', '20000000-0000-4000-8000-000000007001', 'catalog/connector/20000000-0000-4000-8000-000000007001/connector_before_left/connector-before-left.png', 'connector-before-left.png', 'image/png', 0, 'connector_before_left', true, 10),
  ('20000000-0000-4000-8000-000000008002', '20000000-0000-4000-8000-000000007001', 'catalog/connector/20000000-0000-4000-8000-000000007001/connector_before_top/connector-before-top.png', 'connector-before-top.png', 'image/png', 0, 'connector_before_top', false, 20),
  ('20000000-0000-4000-8000-000000008003', '20000000-0000-4000-8000-000000007001', 'catalog/connector/20000000-0000-4000-8000-000000007001/connector_before_bottom/connector-before-bottom.png', 'connector-before-bottom.png', 'image/png', 0, 'connector_before_bottom', false, 30),
  ('20000000-0000-4000-8000-000000008004', '20000000-0000-4000-8000-000000007001', 'catalog/connector/20000000-0000-4000-8000-000000007001/connector_before_right/connector-before-right.png', 'connector-before-right.png', 'image/png', 0, 'connector_before_right', false, 40),
  ('20000000-0000-4000-8000-000000008008', '20000000-0000-4000-8000-000000007001', 'catalog/connector/20000000-0000-4000-8000-000000007001/connector_after_left/connector-after-left.png', 'connector-after-left.png', 'image/png', 0, 'connector_after_left', false, 50),
  ('20000000-0000-4000-8000-000000008009', '20000000-0000-4000-8000-000000007001', 'catalog/connector/20000000-0000-4000-8000-000000007001/connector_after_top/connector-after-top.png', 'connector-after-top.png', 'image/png', 0, 'connector_after_top', false, 60),
  ('20000000-0000-4000-8000-000000008010', '20000000-0000-4000-8000-000000007001', 'catalog/connector/20000000-0000-4000-8000-000000007001/connector_after_bottom/connector-after-bottom.png', 'connector-after-bottom.png', 'image/png', 0, 'connector_after_bottom', false, 70),
  ('20000000-0000-4000-8000-000000008011', '20000000-0000-4000-8000-000000007001', 'catalog/connector/20000000-0000-4000-8000-000000007001/connector_after_right/connector-after-right.png', 'connector-after-right.png', 'image/png', 0, 'connector_after_right', false, 80),
  ('20000000-0000-4000-8000-000000008012', '20000000-0000-4000-8000-000000007001', 'catalog/connector/20000000-0000-4000-8000-000000007001/pinout/connector-pinout.png', 'connector-pinout.png', 'image/png', 0, 'pinout', false, 90),
  ('20000000-0000-4000-8000-000000008005', '20000000-0000-4000-8000-000000007002', 'catalog/wire/20000000-0000-4000-8000-000000007002/product/wire-product.png', 'wire-product.png', 'image/png', 0, 'product', true, 10),
  ('20000000-0000-4000-8000-000000008006', '20000000-0000-4000-8000-000000007003', 'catalog/protective_sleeve/20000000-0000-4000-8000-000000007003/product/sleeve-product.png', 'sleeve-product.png', 'image/png', 0, 'product', true, 10),
  ('20000000-0000-4000-8000-000000008007', '20000000-0000-4000-8000-000000007004', 'catalog/overmold/20000000-0000-4000-8000-000000007004/product/overmold-product.png', 'overmold-product.png', 'image/png', 0, 'product', true, 10)
on conflict (id) do nothing;
