-- Recipeek schema: profiles, friends, recipes, labels, gifts + RLS + storage.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now()
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));

create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id, status);

create table public.labels (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  color      text not null default '#C45C26',
  created_at timestamptz not null default now()
);
create unique index labels_owner_name_idx on public.labels (owner_id, lower(name));

create table public.recipes (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title                 text not null check (char_length(btrim(title)) between 1 and 200),
  description           text,
  source_url            text,
  source_name           text,
  image_path            text,
  servings              integer check (servings is null or servings > 0),
  prep_minutes          integer check (prep_minutes is null or prep_minutes >= 0),
  cook_minutes          integer check (cook_minutes is null or cook_minutes >= 0),
  notes                 text,
  category              text check (category is null or category in (
                          'starter', 'main', 'dessert', 'side', 'snack', 'drink', 'other'
                        )),
  cuisine               text,
  gifted_from_user_id   uuid references public.profiles (id) on delete set null,
  gifted_from_recipe_id uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index recipes_owner_id_idx on public.recipes (owner_id, created_at desc);

create table public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  position   integer not null default 0,
  item       text not null check (char_length(btrim(item)) between 1 and 500)
);
create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id, position);

create table public.recipe_steps (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  position   integer not null default 0,
  body       text not null check (char_length(btrim(body)) between 1 and 4000)
);
create index recipe_steps_recipe_id_idx on public.recipe_steps (recipe_id, position);

create table public.recipe_labels (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  label_id  uuid not null references public.labels (id) on delete cascade,
  primary key (recipe_id, label_id)
);

create table public.gifts (
  id                 uuid primary key default gen_random_uuid(),
  recipe_id          uuid not null references public.recipes (id) on delete cascade,
  from_user_id       uuid not null references public.profiles (id) on delete cascade,
  to_user_id         uuid not null references public.profiles (id) on delete cascade,
  message            text,
  status             text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_recipe_id  uuid references public.recipes (id) on delete set null,
  created_at         timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);
create index gifts_to_user_idx on public.gifts (to_user_id, status);
create index gifts_from_user_idx on public.gifts (from_user_id, created_at desc);

alter table public.recipes
  add constraint recipes_gifted_from_recipe_fk
  foreign key (gifted_from_recipe_id) references public.recipes (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create function public.are_friends(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and (
        (requester_id = auth.uid() and addressee_id = p_other)
        or (requester_id = p_other and addressee_id = auth.uid())
      )
  );
$$;

-- Bypass RLS so a pending request or gift does not hide the other person's profile.
create function public.can_see_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = auth.uid()
    or exists (
      select 1 from public.friendships
      where (requester_id = auth.uid() and addressee_id = p_user_id)
         or (addressee_id = auth.uid() and requester_id = p_user_id)
    )
    or exists (
      select 1 from public.gifts
      where (from_user_id = auth.uid() and to_user_id = p_user_id)
         or (to_user_id = auth.uid() and from_user_id = p_user_id)
    );
$$;

create function public.can_view_recipe(p_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id
      and (
        r.owner_id = auth.uid()
        or exists (
          select 1 from public.gifts g
          where g.recipe_id = r.id and g.to_user_id = auth.uid()
        )
      )
  );
$$;

create function public.is_recipe_owner(p_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes
    where id = p_recipe_id and owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_recipe_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.touch_recipe_updated_at();

-- ---------------------------------------------------------------------------
-- Friend / gift / clone RPCs
-- ---------------------------------------------------------------------------

create function public.request_friend(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_existing public.friendships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(btrim(p_email));

  if v_user_id is null then
    raise exception 'No user found with that email' using errcode = 'P0002';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'You cannot add yourself as a friend' using errcode = '22023';
  end if;

  select * into v_existing
  from public.friendships
  where (requester_id = auth.uid() and addressee_id = v_user_id)
     or (requester_id = v_user_id and addressee_id = auth.uid());

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'You are already friends' using errcode = '23505';
    end if;
    if v_existing.addressee_id = auth.uid() then
      update public.friendships
        set status = 'accepted'
        where id = v_existing.id;
      return v_existing.id;
    end if;
    raise exception 'Friend request already sent' using errcode = '23505';
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (auth.uid(), v_user_id, 'pending')
  returning id into v_existing.id;

  return v_existing.id;
end;
$$;

create function public.respond_friend(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.friendships%rowtype;
begin
  select * into v_row from public.friendships where id = p_friendship_id;
  if not found then
    raise exception 'Friend request not found' using errcode = 'P0002';
  end if;
  if v_row.addressee_id <> auth.uid() then
    raise exception 'Only the recipient can respond' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This request has already been answered' using errcode = '22023';
  end if;

  if p_accept then
    update public.friendships set status = 'accepted' where id = p_friendship_id;
  else
    delete from public.friendships where id = p_friendship_id;
  end if;
end;
$$;

create function public.clone_recipe(p_recipe_id uuid, p_new_owner uuid, p_from_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_id uuid;
  v_src public.recipes%rowtype;
  r record;
  v_label_id uuid;
begin
  select * into v_src from public.recipes where id = p_recipe_id;
  if not found then
    raise exception 'Recipe not found' using errcode = 'P0002';
  end if;

  insert into public.recipes (
    owner_id, title, description, source_url, source_name,
    image_path, servings, prep_minutes, cook_minutes, notes,
    category, cuisine, gifted_from_user_id, gifted_from_recipe_id
  ) values (
    p_new_owner, v_src.title, v_src.description, v_src.source_url, v_src.source_name,
    v_src.image_path, v_src.servings, v_src.prep_minutes, v_src.cook_minutes, v_src.notes,
    v_src.category, v_src.cuisine, p_from_user, p_recipe_id
  )
  returning id into v_new_id;

  insert into public.recipe_ingredients (recipe_id, position, item)
  select v_new_id, position, item
  from public.recipe_ingredients
  where recipe_id = p_recipe_id;

  insert into public.recipe_steps (recipe_id, position, body)
  select v_new_id, position, body
  from public.recipe_steps
  where recipe_id = p_recipe_id;

  for r in
    select l.name, l.color
    from public.recipe_labels rl
    join public.labels l on l.id = rl.label_id
    where rl.recipe_id = p_recipe_id
  loop
    select id into v_label_id
    from public.labels
    where owner_id = p_new_owner and lower(name) = lower(r.name);

    if v_label_id is null then
      insert into public.labels (owner_id, name, color)
      values (p_new_owner, r.name, r.color)
      returning id into v_label_id;
    end if;

    insert into public.recipe_labels (recipe_id, label_id)
    values (v_new_id, v_label_id)
    on conflict do nothing;
  end loop;

  return v_new_id;
end;
$$;

create function public.gift_recipe(p_recipe_id uuid, p_to_user_id uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gift_id uuid;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select owner_id into v_owner from public.recipes where id = p_recipe_id;
  if v_owner is null then
    raise exception 'Recipe not found' using errcode = 'P0002';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'You can only gift recipes you own' using errcode = '42501';
  end if;
  if p_to_user_id = auth.uid() then
    raise exception 'You cannot gift a recipe to yourself' using errcode = '22023';
  end if;
  if not public.are_friends(p_to_user_id) then
    raise exception 'You can only gift recipes to friends' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.gifts
    where recipe_id = p_recipe_id
      and from_user_id = auth.uid()
      and to_user_id = p_to_user_id
      and status = 'pending'
  ) then
    raise exception 'You already have a pending gift of this recipe to that friend' using errcode = '23505';
  end if;

  insert into public.gifts (recipe_id, from_user_id, to_user_id, message, status)
  values (p_recipe_id, auth.uid(), p_to_user_id, nullif(btrim(p_message), ''), 'pending')
  returning id into v_gift_id;

  return v_gift_id;
end;
$$;

create function public.respond_gift(p_gift_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gift public.gifts%rowtype;
  v_new_id uuid;
begin
  select * into v_gift from public.gifts where id = p_gift_id;
  if not found then
    raise exception 'Gift not found' using errcode = 'P0002';
  end if;
  if v_gift.to_user_id <> auth.uid() then
    raise exception 'Only the recipient can respond' using errcode = '42501';
  end if;
  if v_gift.status <> 'pending' then
    raise exception 'This gift has already been answered' using errcode = '22023';
  end if;

  if p_accept then
    v_new_id := public.clone_recipe(v_gift.recipe_id, auth.uid(), v_gift.from_user_id);
    update public.gifts
      set status = 'accepted', created_recipe_id = v_new_id
      where id = p_gift_id;
    return v_new_id;
  end if;

  update public.gifts set status = 'declined' where id = p_gift_id;
  return null;
end;
$$;

revoke all on function public.request_friend(text) from public, anon;
revoke all on function public.respond_friend(uuid, boolean) from public, anon;
revoke all on function public.gift_recipe(uuid, uuid, text) from public, anon;
revoke all on function public.respond_gift(uuid, boolean) from public, anon;
revoke all on function public.clone_recipe(uuid, uuid, uuid) from public, anon;
grant execute on function public.request_friend(text) to authenticated;
grant execute on function public.respond_friend(uuid, boolean) to authenticated;
grant execute on function public.gift_recipe(uuid, uuid, text) to authenticated;
grant execute on function public.respond_gift(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.friendships        enable row level security;
alter table public.labels             enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps       enable row level security;
alter table public.recipe_labels      enable row level security;
alter table public.gifts              enable row level security;

create policy "profiles_select" on public.profiles
  for select to authenticated
  using (public.can_see_profile(id));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "friendships_select" on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "friendships_delete" on public.friendships
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "labels_select" on public.labels
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.recipe_labels rl
      where rl.label_id = labels.id
        and public.can_view_recipe(rl.recipe_id)
    )
  );

create policy "labels_insert" on public.labels
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "labels_update" on public.labels
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "labels_delete" on public.labels
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "recipes_select" on public.recipes
  for select to authenticated
  using (owner_id = auth.uid() or public.can_view_recipe(id));

create policy "recipes_insert" on public.recipes
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "recipes_update" on public.recipes
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "recipes_delete" on public.recipes
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "ingredients_select" on public.recipe_ingredients
  for select to authenticated
  using (public.can_view_recipe(recipe_id));

create policy "ingredients_write" on public.recipe_ingredients
  for all to authenticated
  using (public.is_recipe_owner(recipe_id))
  with check (public.is_recipe_owner(recipe_id));

create policy "steps_select" on public.recipe_steps
  for select to authenticated
  using (public.can_view_recipe(recipe_id));

create policy "steps_write" on public.recipe_steps
  for all to authenticated
  using (public.is_recipe_owner(recipe_id))
  with check (public.is_recipe_owner(recipe_id));

create policy "recipe_labels_select" on public.recipe_labels
  for select to authenticated
  using (public.can_view_recipe(recipe_id));

create policy "recipe_labels_write" on public.recipe_labels
  for all to authenticated
  using (public.is_recipe_owner(recipe_id))
  with check (public.is_recipe_owner(recipe_id));

create policy "gifts_select" on public.gifts
  for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

create policy "gifts_delete_pending" on public.gifts
  for delete to authenticated
  using (from_user_id = auth.uid() and status = 'pending');

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.friendships, public.labels, public.recipes,
  public.recipe_ingredients, public.recipe_steps, public.recipe_labels, public.gifts from anon;

grant select, update on public.profiles to authenticated;
grant select, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.labels to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;
grant select, insert, update, delete on public.recipe_steps to authenticated;
grant select, insert, update, delete on public.recipe_labels to authenticated;
grant select, delete on public.gifts to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
)
on conflict (id) do nothing;

create policy "recipe_images_select" on storage.objects
  for select to public
  using (bucket_id = 'recipe-images');

create policy "recipe_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recipe_images_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recipe_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.friendships replica identity full;
alter table public.gifts       replica identity full;
alter table public.recipes     replica identity full;

alter publication supabase_realtime add table public.friendships, public.gifts, public.recipes;
