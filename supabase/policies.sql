-- Run this once, after schema.sql, now that RLS is enabled on these tables.
--
-- This is a single-user, single-device app — the anon key already ships
-- inside the app binary, so a full-access policy here doesn't weaken
-- anything that wasn't already true when RLS was off. It just satisfies
-- RLS explicitly instead of relying on RLS being disabled.

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

-- Storage: the anon key needs to read/write the piece-photos bucket too.
drop policy if exists "piece_photos_all" on storage.objects;
create policy "piece_photos_all" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'piece-photos')
  with check (bucket_id = 'piece-photos');
