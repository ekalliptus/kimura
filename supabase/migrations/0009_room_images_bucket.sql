-- =============================================================================
-- Kimura Kostay — room-images storage bucket
-- Public bucket holding room-type photos uploaded from the admin "Add/Edit Room
-- Type" dialog. Public so object URLs render directly on the marketing site
-- (and feed the edge /_img optimizer); uploads go through the admin worker's
-- service-role key, which bypasses storage RLS — so no INSERT/SELECT policies
-- are needed here. file_size_limit + allowed_mime_types are defense-in-depth on
-- top of the admin upload route's own validation.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-images',
  'room-images',
  true,
  2097152,                                          -- 2 MiB, matches the upload route cap
  array['image/webp', 'image/jpeg', 'image/png', 'image/avif']
)
on conflict (id) do nothing;
