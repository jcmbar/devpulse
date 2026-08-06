-- Meal PIX receipt requirement (reembolso refeição).
-- Flag on compensation + new attachment type + allow post-finalize upload/review.

alter table public.developer_compensation
  add column if not exists require_meal_pix_receipt boolean not null default false;

comment on column public.developer_compensation.require_meal_pix_receipt is
  'Quando true, após finalizar fechamento com dias de refeição o developer deve enviar comprovante PIX; bloqueia novos fechamentos até o gestor aceitar.';

alter table public.monthly_closing_attachments
  drop constraint if exists monthly_closing_attachments_type_check;

alter table public.monthly_closing_attachments
  add constraint monthly_closing_attachments_type_check
  check (type in ('invoice_pdf', 'boleto_pdf', 'meal_pix_receipt'));

alter table public.monthly_closing_attachments
  add column if not exists review_notes text;

comment on column public.monthly_closing_attachments.review_notes is
  'Observação do gestor na revisão do comprovante PIX (aceite/recusa).';

-- Allow meal PIX insert/update/review while closing is finalized.
-- Developers may replace the file but cannot self-approve (is_valid stays pending).
create or replace function public.prevent_finalized_monthly_closing_attachment_mutation()
returns trigger
language plpgsql
as $$
declare
  closing_status text;
  attachment_type text;
  is_manager boolean;
begin
  select status into closing_status
  from public.monthly_closings
  where id = coalesce(new.monthly_closing_id, old.monthly_closing_id);

  attachment_type := coalesce(new.type, old.type);

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'gestor')
  ) into is_manager;

  if closing_status = 'finalized' then
    if attachment_type = 'meal_pix_receipt' then
      if tg_op = 'DELETE' then
        return old;
      end if;
      if not is_manager then
        new.is_valid := null;
        new.validated_at := null;
        new.validated_by_user_id := null;
        new.review_notes := null;
      end if;
      return new;
    end if;

    raise exception 'Anexos de fechamento finalizado não podem ser alterados.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Storage: allow developer to upsert meal_pix_receipt on finalized closings.
drop policy if exists "monthly_closing_storage_insert_own_closed"
  on storage.objects;
create policy "monthly_closing_storage_insert_own_closed"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'monthly-closing-attachments'
    and exists (
      select 1
      from public.monthly_closings c
      where c.id::text = (storage.foldername(name))[1]
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
        and (
          c.status = 'closed'
          or (
            c.status = 'finalized'
            and name like '%/meal_pix_receipt.pdf'
          )
        )
    )
  );

drop policy if exists "monthly_closing_storage_update_own_closed"
  on storage.objects;
create policy "monthly_closing_storage_update_own_closed"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'monthly-closing-attachments'
    and exists (
      select 1
      from public.monthly_closings c
      where c.id::text = (storage.foldername(name))[1]
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
        and (
          c.status = 'closed'
          or (
            c.status = 'finalized'
            and name like '%/meal_pix_receipt.pdf'
          )
        )
    )
  )
  with check (
    bucket_id = 'monthly-closing-attachments'
    and exists (
      select 1
      from public.monthly_closings c
      where c.id::text = (storage.foldername(name))[1]
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
        and (
          c.status = 'closed'
          or (
            c.status = 'finalized'
            and name like '%/meal_pix_receipt.pdf'
          )
        )
    )
  );

-- Table RLS: insert/update own meal_pix on finalized.
drop policy if exists "monthly_closing_attachments_insert_own_closed"
  on public.monthly_closing_attachments;
create policy "monthly_closing_attachments_insert_own_closed"
  on public.monthly_closing_attachments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
        and (
          c.status = 'closed'
          or (c.status = 'finalized' and type = 'meal_pix_receipt')
        )
    )
  );

drop policy if exists "monthly_closing_attachments_update_own_closed"
  on public.monthly_closing_attachments;
create policy "monthly_closing_attachments_update_own_closed"
  on public.monthly_closing_attachments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
        and (
          c.status = 'closed'
          or (c.status = 'finalized' and type = 'meal_pix_receipt')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
        and (
          c.status = 'closed'
          or (c.status = 'finalized' and type = 'meal_pix_receipt')
        )
    )
  );
