-- Arqeia — esquema inicial (projetos, revisões, auditoria)
-- Rode no SQL Editor do projeto Supabase (ou via `supabase db push`).
-- Todo acesso passa por RLS: cada usuário só enxerga e altera os próprios projetos.

create table if not exists public.projects (
  id            text primary key,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  code          text not null default '',
  client        text not null default '',
  project_type  text not null,
  is_demo       boolean not null default false,
  revision      integer not null,
  entity_count  integer not null default 0,
  data          jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists projects_owner_idx on public.projects (owner_id, updated_at desc) where deleted_at is null;

create table if not exists public.revisions (
  project_id    text not null references public.projects (id) on delete cascade,
  revision      integer not null,
  label         text not null default '',
  entity_count  integer not null default 0,
  data          jsonb not null,
  created_at    timestamptz not null default now(),
  primary key (project_id, revision)
);

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  project_id  text,
  user_id     uuid not null default auth.uid(),
  action      text not null,
  detail      text not null default '',
  at          timestamptz not null default now()
);
create index if not exists audit_log_project_idx on public.audit_log (project_id);

alter table public.projects  enable row level security;
alter table public.revisions enable row level security;
alter table public.audit_log enable row level security;

-- projects: dono lê, cria e atualiza (exclusão é lógica, via deleted_at)
create policy projects_select on public.projects for select to authenticated using (owner_id = (select auth.uid()));
create policy projects_insert on public.projects for insert to authenticated with check (owner_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- revisions: acessíveis apenas se o projeto pertence ao usuário
create policy revisions_select on public.revisions for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy revisions_insert on public.revisions for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy revisions_delete on public.revisions for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

-- audit_log: só inserção e leitura do próprio usuário (sem update/delete)
create policy audit_insert on public.audit_log for insert to authenticated with check (user_id = (select auth.uid()));
create policy audit_select on public.audit_log for select to authenticated using (user_id = (select auth.uid()));

-- Criação atômica: projeto + revisão 1 + auditoria
create or replace function public.create_project(p_id text, p_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := (select count(*) from jsonb_object_keys(p_data -> 'entities'));
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.projects (id, name, code, client, project_type, is_demo, revision, entity_count, data)
  values (
    p_id,
    p_data #>> '{meta,name}',
    coalesce(p_data #>> '{meta,code}', ''),
    coalesce(p_data #>> '{meta,client}', ''),
    p_data #>> '{meta,projectType}',
    coalesce((p_data #>> '{meta,isDemo}')::boolean, false),
    1, v_count, p_data
  );
  insert into public.revisions (project_id, revision, label, entity_count, data)
  values (p_id, 1, 'Projeto criado', v_count, p_data);
  insert into public.audit_log (project_id, action, detail) values (p_id, 'project.create', p_data #>> '{meta,name}');
  return jsonb_build_object('status', 'ok', 'revision', 1);
end;
$$;

-- Salvamento com concorrência otimista: só grava se p_base for a revisão atual.
create or replace function public.save_project(p_id text, p_base integer, p_data jsonb, p_label text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rev integer;
  v_current integer;
  v_count integer := (select count(*) from jsonb_object_keys(p_data -> 'entities'));
begin
  update public.projects
     set name = p_data #>> '{meta,name}',
         code = coalesce(p_data #>> '{meta,code}', ''),
         client = coalesce(p_data #>> '{meta,client}', ''),
         project_type = p_data #>> '{meta,projectType}',
         is_demo = coalesce((p_data #>> '{meta,isDemo}')::boolean, false),
         revision = revision + 1,
         entity_count = v_count,
         data = p_data,
         updated_at = now()
   where id = p_id and deleted_at is null and revision = p_base
  returning revision into v_rev;

  if v_rev is null then
    select revision into v_current from public.projects where id = p_id and deleted_at is null;
    if v_current is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    return jsonb_build_object('status', 'conflict', 'current', v_current);
  end if;

  insert into public.revisions (project_id, revision, label, entity_count, data)
  values (p_id, v_rev, coalesce(p_label, ''), v_count, p_data);
  delete from public.revisions where project_id = p_id and revision <= v_rev - 200;
  insert into public.audit_log (project_id, action, detail) values (p_id, 'project.save', 'rev ' || v_rev || ': ' || coalesce(p_label, ''));
  return jsonb_build_object('status', 'ok', 'revision', v_rev);
end;
$$;

revoke execute on function public.create_project(text, jsonb) from public, anon;
revoke execute on function public.save_project(text, integer, jsonb, text) from public, anon;
grant execute on function public.create_project(text, jsonb) to authenticated;
grant execute on function public.save_project(text, integer, jsonb, text) to authenticated;
