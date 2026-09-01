-- =============================================================================
--  TECH STORE — 04_seed.sql
--  Sample data so you have something to build the React frontend against.
--  Run this LAST. Optional — skip it if you are loading a real catalogue.
--  Safe to re-run: it matches on slug/sku and updates instead of duplicating.
-- =============================================================================

-- ---------------------------------------------------------------------------
--  Top-level categories
-- ---------------------------------------------------------------------------
insert into public.categories (name, slug, description, display_order) values
  ('Laptops',       'laptops',       'Gaming, business and everyday notebooks',       1),
  ('PC Parts',      'pc-parts',      'Components for building and upgrading desktops', 2),
  ('Phone Cases',   'phone-cases',   'Protection and style for your phone',            3),
  ('Electronics',   'electronics',   'Peripherals, audio and general gadgets',         4)
on conflict (slug) do update set description = excluded.description;

-- ---------------------------------------------------------------------------
--  Sub-categories (parent_id resolved by slug lookup)
-- ---------------------------------------------------------------------------
insert into public.categories (name, slug, description, parent_id, display_order)
select v.name, v.slug, v.description,
       (select id from public.categories where slug = v.parent_slug),
       v.display_order
from (values
  ('Gaming Laptops',   'gaming-laptops',   'High-refresh screens and discrete GPUs', 'laptops',     1),
  ('Business Laptops', 'business-laptops', 'Long battery life and durable builds',   'laptops',     2),
  ('Graphics Cards',   'graphics-cards',   'GPUs from entry level to enthusiast',    'pc-parts',    1),
  ('Memory (RAM)',     'memory-ram',       'DDR4 and DDR5 desktop and laptop kits',  'pc-parts',    2),
  ('Storage',          'storage',          'NVMe SSDs, SATA drives and externals',   'pc-parts',    3),
  ('iPhone Cases',     'iphone-cases',     'Cases for every recent iPhone model',    'phone-cases', 1),
  ('Samsung Cases',    'samsung-cases',    'Cases for the Galaxy range',             'phone-cases', 2)
) as v(name, slug, description, parent_slug, display_order)
on conflict (slug) do update set parent_id = excluded.parent_id;

-- ---------------------------------------------------------------------------
--  Products. Note how `specs` differs completely per category — that is the
--  JSONB design paying off.
-- ---------------------------------------------------------------------------
insert into public.products
  (category_id, name, slug, sku, brand, base_price, sale_price, stock_quantity,
   short_description, description, specs, is_featured)
select
  (select id from public.categories where slug = v.category_slug),
  v.name, v.slug, v.sku, v.brand, v.base_price, v.sale_price, v.stock_quantity,
  v.short_description, v.description, v.specs::jsonb, v.is_featured
from (values
  ('gaming-laptops', 'Raptor 15 RTX Gaming Laptop', 'raptor-15-rtx-gaming-laptop', 'LAP-RPT-15-001',
   'Nexus', 1899.00, 1699.00, 12,
   '15.6" 165Hz gaming laptop with RTX 4070',
   'A gaming laptop built around a 140W RTX 4070 and a vapour chamber cooler, so it holds its boost clocks through a long session instead of throttling after ten minutes.',
   '{"cpu":"Intel Core i7-13700H","gpu":"NVIDIA RTX 4070 8GB","ram_gb":16,"ram_type":"DDR5","storage_gb":1000,"storage_type":"NVMe SSD","screen_size":15.6,"resolution":"2560x1440","refresh_rate_hz":165,"weight_kg":2.3,"os":"Windows 11 Home","ports":["USB-C Thunderbolt 4","HDMI 2.1","3x USB-A","RJ45"]}',
   true),

  ('business-laptops', 'ProBook 14 Ultra', 'probook-14-ultra', 'LAP-PRB-14-002',
   'Meridian', 1299.00, null, 24,
   '14" ultraportable, 18-hour battery',
   'A 1.1kg magnesium chassis with a spill-resistant keyboard and a battery that genuinely lasts a working day away from a socket.',
   '{"cpu":"AMD Ryzen 7 7840U","gpu":"Radeon 780M integrated","ram_gb":32,"ram_type":"LPDDR5","storage_gb":1000,"storage_type":"NVMe SSD","screen_size":14.0,"resolution":"1920x1200","refresh_rate_hz":60,"weight_kg":1.1,"battery_wh":75,"os":"Windows 11 Pro"}',
   true),

  ('graphics-cards', 'PhotonForce RTX 4070 Super 12GB', 'photonforce-rtx-4070-super-12gb', 'GPU-PF-4070S-003',
   'PhotonForce', 649.00, 599.00, 8,
   'Triple-fan RTX 4070 Super',
   'A triple-fan cooler keeps this card near-silent under load, and the 12GB frame buffer handles 1440p ultra settings comfortably.',
   '{"chipset":"NVIDIA RTX 4070 Super","vram_gb":12,"vram_type":"GDDR6X","boost_clock_mhz":2475,"tdp_watts":220,"recommended_psu_watts":650,"length_mm":304,"slot_width":2.5,"outputs":["3x DisplayPort 1.4a","1x HDMI 2.1"],"power_connectors":"1x 16-pin"}',
   true),

  ('memory-ram', 'VoltCore DDR5-6000 32GB Kit (2x16GB)', 'voltcore-ddr5-6000-32gb-kit', 'RAM-VC-D5-32-004',
   'VoltCore', 129.00, null, 45,
   '32GB DDR5-6000 CL30 dual kit',
   'An EXPO and XMP profile kit that reaches its rated speed from a single BIOS toggle, with a low-profile heatspreader that clears tall CPU coolers.',
   '{"capacity_gb":32,"modules":2,"module_capacity_gb":16,"type":"DDR5","speed_mhz":6000,"cas_latency":30,"voltage":1.35,"form_factor":"DIMM","heatspreader":true,"rgb":false}',
   false),

  ('storage', 'HyperDrive NVMe Gen4 2TB', 'hyperdrive-nvme-gen4-2tb', 'SSD-HD-G4-2TB-005',
   'HyperDrive', 159.00, 139.00, 60,
   '2TB PCIe 4.0 NVMe, 7300 MB/s',
   'A Gen4 drive with a full-size DRAM cache, so sustained writes hold up instead of collapsing once the SLC buffer fills.',
   '{"capacity_gb":2000,"interface":"PCIe 4.0 x4","form_factor":"M.2 2280","read_speed_mbps":7300,"write_speed_mbps":6900,"nand_type":"TLC","dram_cache":true,"tbw":1200,"warranty_years":5}',
   false),

  ('iphone-cases', 'ArmorFlex Clear Case', 'armorflex-clear-case', 'CASE-AF-CLR-006',
   'ArmorFlex', 24.99, 19.99, 150,
   'Anti-yellowing clear case, MagSafe',
   'A hybrid case with a rigid back and a shock-absorbing TPU bumper, using a coating that resists the yellowing clear cases are notorious for.',
   '{"compatible_models":["iPhone 15","iPhone 15 Plus","iPhone 15 Pro","iPhone 15 Pro Max"],"material":"TPU + Polycarbonate","color":"Clear","magsafe_compatible":true,"drop_protection_m":3.0,"raised_bezel":true,"wireless_charging":true}',
   false),

  ('samsung-cases', 'RuggedShield Galaxy Case', 'ruggedshield-galaxy-case', 'CASE-RS-GAL-007',
   'RuggedShield', 29.99, null, 90,
   'Military-grade drop protection',
   'A two-layer case with a built-in kickstand and a raised lip around the camera array, tested to MIL-STD-810G.',
   '{"compatible_models":["Galaxy S24","Galaxy S24+","Galaxy S24 Ultra"],"material":"Polycarbonate + Silicone","color":"Matte Black","magsafe_compatible":false,"drop_protection_m":4.5,"kickstand":true,"certification":"MIL-STD-810G"}',
   false),

  ('electronics', 'SoundWave Pro ANC Headphones', 'soundwave-pro-anc-headphones', 'AUD-SW-ANC-008',
   'SoundWave', 249.00, 199.00, 35,
   'Over-ear ANC, 40-hour battery',
   'Hybrid active noise cancelling with a transparency mode, plus multipoint pairing so they stay connected to a laptop and phone at once.',
   '{"type":"Over-ear","connectivity":["Bluetooth 5.3","3.5mm","USB-C"],"anc":true,"battery_hours":40,"charging":"USB-C","codecs":["SBC","AAC","LDAC"],"weight_g":265,"multipoint":true,"foldable":true}',
   true),

  ('electronics', 'TypeMaster Mechanical Keyboard 75%', 'typemaster-mechanical-keyboard-75', 'KBD-TM-75-009',
   'TypeMaster', 119.00, null, 0,
   '75% hot-swap mechanical, currently sold out',
   'A gasket-mounted 75% board with hot-swap sockets, so you can change switches without soldering. Included here with zero stock so you can test the out-of-stock path.',
   '{"layout":"75%","switch_type":"Linear Red","hot_swappable":true,"connectivity":["USB-C","Bluetooth 5.1","2.4GHz"],"backlight":"RGB per-key","keycaps":"PBT Double-shot","battery_mah":4000,"n_key_rollover":true}',
   false)
) as v(category_slug, name, slug, sku, brand, base_price, sale_price, stock_quantity,
       short_description, description, specs, is_featured)
on conflict (slug) do update
  set base_price     = excluded.base_price,
      sale_price     = excluded.sale_price,
      stock_quantity = excluded.stock_quantity,
      specs          = excluded.specs;

-- ---------------------------------------------------------------------------
--  Spec field definitions — these drive the filter sidebar in React.
-- ---------------------------------------------------------------------------
insert into public.category_spec_fields
  (category_id, spec_key, label, unit, data_type, is_filterable, options, display_order)
select
  (select id from public.categories where slug = v.category_slug),
  v.spec_key, v.label, v.unit, v.data_type, v.is_filterable, v.options::jsonb, v.display_order
from (values
  ('gaming-laptops', 'cpu',        'Processor',   null, 'text',   true,  '[]', 1),
  ('gaming-laptops', 'gpu',        'Graphics',    null, 'text',   true,  '[]', 2),
  ('gaming-laptops', 'ram_gb',     'RAM',         'GB', 'number', true,  '[8,16,32,64]', 3),
  ('gaming-laptops', 'storage_gb', 'Storage',     'GB', 'number', true,  '[512,1000,2000]', 4),
  ('gaming-laptops', 'refresh_rate_hz','Refresh Rate','Hz','number',true,'[60,120,144,165,240]', 5),
  ('graphics-cards', 'chipset',    'Chipset',     null, 'text',   true,  '[]', 1),
  ('graphics-cards', 'vram_gb',    'Video Memory','GB', 'number', true,  '[8,12,16,24]', 2),
  ('graphics-cards', 'tdp_watts',  'Power Draw',  'W',  'number', false, '[]', 3),
  ('memory-ram',     'capacity_gb','Capacity',    'GB', 'number', true,  '[8,16,32,64]', 1),
  ('memory-ram',     'speed_mhz',  'Speed',       'MHz','number', true,  '[3200,5600,6000,6400]', 2),
  ('memory-ram',     'type',       'Type',        null, 'list',   true,  '["DDR4","DDR5"]', 3),
  ('iphone-cases',   'compatible_models','Fits Model',null,'list',true,  '["iPhone 15","iPhone 15 Plus","iPhone 15 Pro","iPhone 15 Pro Max"]', 1),
  ('iphone-cases',   'magsafe_compatible','MagSafe',null,'boolean',true, '[]', 2),
  ('iphone-cases',   'material',   'Material',    null, 'text',   true,  '[]', 3),
  ('samsung-cases',  'compatible_models','Fits Model',null,'list',true,  '["Galaxy S24","Galaxy S24+","Galaxy S24 Ultra"]', 1)
) as v(category_slug, spec_key, label, unit, data_type, is_filterable, options, display_order)
on conflict (category_id, spec_key) do update
  set label = excluded.label, options = excluded.options;

-- ---------------------------------------------------------------------------
--  Quick sanity check — run this after seeding.
-- ---------------------------------------------------------------------------
-- select c.name as category, count(p.id) as products, coalesce(sum(p.stock_quantity),0) as units
--   from public.categories c
--   left join public.products p on p.category_id = c.id
--  group by c.name order by c.name;
