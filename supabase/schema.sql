-- Elaris cloud mirror (section 5 of the implementation plan).
-- Paste this into the Supabase SQL Editor once, on a fresh project.
--
-- Column names and types deliberately mirror the local SQLite schema
-- exactly (snake_case, money/weight as bigint centimes/milligrams, every
-- timestamp-shaped column as plain ISO-8601 text) so the sync engine can
-- push and pull rows without per-column translation.
--
-- RLS is enabled with a single permissive "allow_all" policy per table
-- (see the bottom of this file). This is a single-user, single-device app
-- and the anon key already ships inside the app binary — a real access
-- boundary would need proper auth, which is out of scope for now. If that
-- ever changes, replace these policies with real per-user rules first.

create table if not exists materials (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  name text not null,
  code text not null unique,
  purity text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists markup_rules (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  material_id text references materials(id),
  min_weight_mg bigint not null,
  max_weight_mg bigint not null,
  markup_bps integer not null,
  effective_from text not null
);

create table if not exists customers (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  display_name text not null,
  phone_e164 text,
  instagram_handle text,
  notes text
);

create table if not exists suppliers (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  name text not null,
  kind text not null,
  phone_e164 text,
  city text,
  notes text
);

create table if not exists pieces (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  name text not null,
  sku text unique,
  category text not null,
  material_id text not null references materials(id),
  item_type text not null,
  variant_type text not null,
  default_cost_centimes bigint,
  notes text,
  is_active boolean not null default true
);

create table if not exists variants (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  piece_id text not null references pieces(id),
  label text not null,
  sku text unique,
  barcode text unique,
  nominal_weight_mg bigint not null,
  cost_centimes bigint not null,
  price_centimes bigint not null,
  is_active boolean not null default true
);

create table if not exists piece_photos (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  piece_id text not null references pieces(id),
  uri text not null,
  remote_url text,
  embedding text,
  is_primary boolean not null default false
);

create table if not exists scan_events (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  captured_uri text not null,
  method text not null,
  matched_variant_id text references variants(id),
  confidence real,
  confirmed boolean not null default false,
  occurred_at text not null
);

create table if not exists purchases (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  supplier_id text not null references suppliers(id),
  reference text,
  occurred_at text not null,
  total_centimes bigint not null,
  due_on text,
  note text
);

create table if not exists purchase_items (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  purchase_id text not null references purchases(id),
  variant_id text not null references variants(id),
  qty integer not null,
  weight_mg bigint not null,
  unit_cost_centimes bigint not null
);

create table if not exists supplier_payments (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  supplier_id text not null references suppliers(id),
  purchase_id text references purchases(id),
  amount_centimes bigint not null,
  method text not null,
  paid_on text not null,
  note text
);

create table if not exists custom_orders (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  customer_id text not null references customers(id),
  craftsman_supplier_id text references suppliers(id),
  description text not null,
  reference_photo_uri text,
  material_id text not null references materials(id),
  target_size text,
  target_weight_mg bigint,
  quoted_price_centimes bigint not null,
  agreed_cost_centimes bigint,
  status text not null,
  ordered_on text,
  promised_on text,
  delivered_on text,
  note text
);

create table if not exists sales (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  channel text not null,
  location_label text,
  customer_id text references customers(id),
  subtotal_centimes bigint not null,
  discount_centimes bigint not null default 0,
  total_centimes bigint not null,
  payment_terms text not null,
  status text not null,
  occurred_at text not null,
  handed_over_at text,
  due_on text,
  note text
);

create table if not exists sale_items (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  sale_id text not null references sales(id),
  variant_id text not null references variants(id),
  qty integer not null,
  weight_mg_actual bigint not null,
  unit_cost_centimes bigint not null,
  markup_pct_applied integer not null,
  unit_price_centimes bigint not null,
  discount_centimes bigint not null default 0
);

create table if not exists customer_payments (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  sale_id text references sales(id),
  custom_order_id text references custom_orders(id),
  customer_id text not null references customers(id),
  amount_centimes bigint not null,
  method text not null,
  paid_on text not null,
  note text
);

create table if not exists stock_movements (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  variant_id text not null references variants(id),
  type text not null,
  qty_delta integer not null,
  weight_mg bigint,
  unit_cost_centimes bigint not null,
  reason text,
  occurred_at text not null,
  sale_id text references sales(id),
  purchase_id text references purchases(id),
  custom_order_id text references custom_orders(id)
);

create table if not exists reservations (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  variant_id text not null references variants(id),
  customer_id text not null references customers(id),
  qty integer not null,
  status text not null,
  expires_at text
);

create table if not exists social_snapshots (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  platform text not null,
  captured_on text not null,
  followers integer not null,
  posts_count integer not null,
  reach integer,
  profile_views integer,
  source text not null
);

create table if not exists social_posts (
  id text primary key,
  created_at text not null,
  updated_at text not null,
  synced_at text,
  platform text not null,
  external_id text,
  permalink text,
  posted_at text not null,
  caption text,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  views integer not null default 0,
  source text not null
);

-- No base columns (id/created_at/...) — matches the local schema, which
-- defines this purely as a composite-key join table.
create table if not exists post_pieces (
  post_id text not null references social_posts(id),
  piece_id text not null references pieces(id),
  primary key (post_id, piece_id)
);

-- Storage bucket for piece photos (Phase 4: photos upload lazily).
insert into storage.buckets (id, name, public)
values ('piece-photos', 'piece-photos', true)
on conflict (id) do nothing;

-- RLS + a single permissive policy per table — see the note at the top.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'materials', 'markup_rules', 'customers', 'suppliers', 'pieces', 'variants',
      'piece_photos', 'scan_events', 'purchases', 'purchase_items', 'supplier_payments',
      'custom_orders', 'sales', 'sale_items', 'customer_payments', 'stock_movements',
      'reservations', 'social_snapshots', 'social_posts', 'post_pieces'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "allow_all" on %I', t);
    execute format(
      'create policy "allow_all" on %I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

drop policy if exists "piece_photos_all" on storage.objects;
create policy "piece_photos_all" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'piece-photos')
  with check (bucket_id = 'piece-photos');
