-- INSERT … RETURNING applies the SELECT policy to the new row in the same
-- statement. A STABLE helper that queries recipes cannot see that in-flight
-- row, so the insert looked like an RLS failure. Allow owners directly,
-- matching the Listy lists_select pattern.
drop policy if exists "recipes_select" on public.recipes;

create policy "recipes_select" on public.recipes
  for select to authenticated
  using (owner_id = auth.uid() or public.can_view_recipe(id));
