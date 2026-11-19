-- Optional section headings in the ingredient list (e.g. "For the marinade").

alter table public.recipe_ingredients
  add column is_heading boolean not null default false;

create or replace function public.clone_recipe(p_recipe_id uuid, p_new_owner uuid, p_from_user uuid)
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

  insert into public.recipe_ingredients (recipe_id, position, item, is_heading)
  select v_new_id, position, item, is_heading
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
