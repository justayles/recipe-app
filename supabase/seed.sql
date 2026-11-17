-- Local development seed data. Runs on `supabase start` / `supabase db reset`.
-- Test accounts (password for all: password123):
--   alice@example.com
--   bob@example.com
--   cara@example.com

create extension if not exists pgcrypto with schema extensions;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'a1111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'alice@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Alice"}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b2222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'bob@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Bob"}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c3333333-3333-3333-3333-333333333333',
    'authenticated', 'authenticated', 'cara@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Cara"}', now(), now(),
    '', '', '', ''
  );

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (
    gen_random_uuid(), 'a1111111-1111-1111-1111-111111111111',
    'a1111111-1111-1111-1111-111111111111',
    '{"sub":"a1111111-1111-1111-1111-111111111111","email":"alice@example.com","email_verified":true}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), 'b2222222-2222-2222-2222-222222222222',
    'b2222222-2222-2222-2222-222222222222',
    '{"sub":"b2222222-2222-2222-2222-222222222222","email":"bob@example.com","email_verified":true}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), 'c3333333-3333-3333-3333-333333333333',
    'c3333333-3333-3333-3333-333333333333',
    '{"sub":"c3333333-3333-3333-3333-333333333333","email":"cara@example.com","email_verified":true}',
    'email', now(), now(), now()
  );

-- Profiles are created by the on_auth_user_created trigger.

insert into public.friendships (id, requester_id, addressee_id, status) values
  (
    'e1111111-0000-0000-0000-000000000001',
    'a1111111-1111-1111-1111-111111111111',
    'b2222222-2222-2222-2222-222222222222',
    'accepted'
  ),
  (
    'e1111111-0000-0000-0000-000000000002',
    'c3333333-3333-3333-3333-333333333333',
    'a1111111-1111-1111-1111-111111111111',
    'pending'
  );

insert into public.labels (id, owner_id, name, color) values
  ('f1111111-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'vegetarian', '#3E7C59'),
  ('f1111111-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'quick', '#C45C26'),
  ('f1111111-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'baking', '#8B5E3C'),
  ('f1111111-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'weekend', '#5B6B8C');

insert into public.recipes (
  id, owner_id, title, description, source_name, servings, prep_minutes, cook_minutes,
  category, cuisine, notes
) values
  (
    'd1111111-0000-0000-0000-000000000001',
    'a1111111-1111-1111-1111-111111111111',
    'Weeknight tomato pasta',
    'A 20-minute pantry pasta with garlic, chilli and a knob of butter.',
    'Recipeek kitchen',
    2, 5, 15, 'main', 'Italian',
    'Use whatever pasta shape is in the cupboard. Add a tin of tuna if you want protein.'
  ),
  (
    'd1111111-0000-0000-0000-000000000002',
    'a1111111-1111-1111-1111-111111111111',
    'Banana bread',
    'The overripe-banana loaf that never lasts more than a day.',
    'Recipeek kitchen',
    8, 15, 55, 'dessert', 'British',
    'Even better toasted with salted butter the next morning.'
  );

insert into public.recipe_ingredients (recipe_id, position, item) values
  ('d1111111-0000-0000-0000-000000000001', 0, '200g dried pasta'),
  ('d1111111-0000-0000-0000-000000000001', 1, '2 tbsp olive oil'),
  ('d1111111-0000-0000-0000-000000000001', 2, '3 garlic cloves, sliced'),
  ('d1111111-0000-0000-0000-000000000001', 3, '1/2 tsp chilli flakes'),
  ('d1111111-0000-0000-0000-000000000001', 4, '400g tin chopped tomatoes'),
  ('d1111111-0000-0000-0000-000000000001', 5, 'A knob of butter'),
  ('d1111111-0000-0000-0000-000000000001', 6, 'Salt, pepper, and grated parmesan'),
  ('d1111111-0000-0000-0000-000000000002', 0, '3 very ripe bananas, mashed'),
  ('d1111111-0000-0000-0000-000000000002', 1, '75g melted butter, plus extra for the tin'),
  ('d1111111-0000-0000-0000-000000000002', 2, '150g caster sugar'),
  ('d1111111-0000-0000-0000-000000000002', 3, '1 egg, beaten'),
  ('d1111111-0000-0000-0000-000000000002', 4, '1 tsp vanilla extract'),
  ('d1111111-0000-0000-0000-000000000002', 5, '175g self-raising flour'),
  ('d1111111-0000-0000-0000-000000000002', 6, '1 tsp bicarbonate of soda'),
  ('d1111111-0000-0000-0000-000000000002', 7, 'A pinch of salt');

insert into public.recipe_steps (recipe_id, position, body) values
  ('d1111111-0000-0000-0000-000000000001', 0, 'Boil the pasta in well-salted water until just shy of al dente.'),
  ('d1111111-0000-0000-0000-000000000001', 1, 'Warm the oil in a wide pan, then gently cook the garlic and chilli until fragrant — do not brown.'),
  ('d1111111-0000-0000-0000-000000000001', 2, 'Tip in the tomatoes, season, and simmer 8 minutes until thickened.'),
  ('d1111111-0000-0000-0000-000000000001', 3, 'Toss in the drained pasta with a splash of cooking water and the butter. Serve with parmesan.'),
  ('d1111111-0000-0000-0000-000000000002', 0, 'Heat the oven to 180°C / 160°C fan. Butter a 2lb loaf tin and line the base.'),
  ('d1111111-0000-0000-0000-000000000002', 1, 'Mix the mashed banana, melted butter, sugar, egg and vanilla.'),
  ('d1111111-0000-0000-0000-000000000002', 2, 'Fold in the flour, bicarb and salt until just combined.'),
  ('d1111111-0000-0000-0000-000000000002', 3, 'Bake 50–55 minutes until a skewer comes out clean. Cool in the tin 10 minutes, then turn out.');

insert into public.recipe_labels (recipe_id, label_id) values
  ('d1111111-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000001'),
  ('d1111111-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000002'),
  ('d1111111-0000-0000-0000-000000000002', 'f1111111-0000-0000-0000-000000000003'),
  ('d1111111-0000-0000-0000-000000000002', 'f1111111-0000-0000-0000-000000000004');

insert into public.gifts (id, recipe_id, from_user_id, to_user_id, message, status) values
  (
    'aa111111-0000-0000-0000-000000000001',
    'd1111111-0000-0000-0000-000000000001',
    'a1111111-1111-1111-1111-111111111111',
    'b2222222-2222-2222-2222-222222222222',
    'Try this on Tuesday — 20 minutes, promise.',
    'pending'
  );
