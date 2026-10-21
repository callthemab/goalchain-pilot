-- GoalChain closed-pilot schema for Supabase/Postgres.
-- Run in Supabase SQL Editor. Review and test all RLS policies before broad release.
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner','manager','player');
create type public.invitation_status as enum ('pending','accepted','declined','cancelled');
create type public.request_status as enum ('pending','approved','rejected','cancelled');
create type public.match_status as enum ('pending','awaiting_confirmation','approved','disputed','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  gamer_tag text unique,
  bio text not null default '' check (char_length(bio) <= 280),
  preferred_position text not null default 'Flexible',
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  tag text not null unique check (char_length(tag) between 2 and 5),
  description text not null default '' check (char_length(description) <= 500),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (club_id, player_id),
  unique (player_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  message text not null default '' check (char_length(message) <= 500),
  status public.invitation_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (club_id, player_id)
);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 500),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (club_id, player_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  home_club_id uuid not null references public.clubs(id) on delete restrict,
  away_club_id uuid not null references public.clubs(id) on delete restrict,
  home_score integer not null check (home_score between 0 and 99),
  away_score integer not null check (away_score between 0 and 99),
  reported_by uuid not null references public.profiles(id) on delete restrict,
  evidence_url text not null default '' check (char_length(evidence_url) <= 1000),
  notes text not null default '' check (char_length(notes) <= 500),
  status public.match_status not null default 'awaiting_confirmation',
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  check (home_club_id <> away_club_id)
);

-- Profile created automatically after a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Enforce max 11 members, one club per player, and membership only when accepted.
create or replace function public.enforce_club_membership()
returns trigger language plpgsql security definer set search_path = public
as $$
declare member_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.club_id::text));
  select count(*) into member_count from public.club_members where club_id = new.club_id;
  if member_count >= 11 then raise exception 'This club already has 11 players.'; end if;
  if exists (select 1 from public.club_members where player_id = new.player_id) then
    raise exception 'A player can belong to only one club during the pilot.';
  end if;
  return new;
end;
$$;
create trigger check_club_membership before insert on public.club_members
for each row execute procedure public.enforce_club_membership();

create or replace function public.is_club_manager(target_club uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.club_members cm
    where cm.club_id = target_club and cm.player_id = auth.uid()
      and cm.role in ('owner','manager')
  );
$$;

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.invitations enable row level security;
alter table public.join_requests enable row level security;
alter table public.matches enable row level security;

create policy "Profiles visible to signed-in users" on public.profiles for select to authenticated using (true);
create policy "Players update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Players insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "Clubs visible to signed-in users" on public.clubs for select to authenticated using (true);
create policy "Signed-in players create clubs" on public.clubs for insert to authenticated with check (owner_id = auth.uid());
create policy "Club managers update clubs" on public.clubs for update to authenticated using (public.is_club_manager(id)) with check (public.is_club_manager(id));

create policy "Membership visible to signed-in users" on public.club_members for select to authenticated using (true);
create policy "Owner can add self as first member" on public.club_members for insert to authenticated with check (
  player_id = auth.uid() and role = 'owner'
  and exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
);
create policy "Invited player can join after accepting" on public.club_members for insert to authenticated with check (
  player_id = auth.uid() and role = 'player'
  and exists (select 1 from public.invitations i where i.club_id = club_id and i.player_id = auth.uid() and i.status = 'accepted')
);
create policy "Managers remove members or self leave" on public.club_members for delete to authenticated using (
  public.is_club_manager(club_id) or player_id = auth.uid()
);
create policy "Managers update member roles" on public.club_members for update to authenticated using (public.is_club_manager(club_id)) with check (public.is_club_manager(club_id));

create policy "Players and managers read invitations" on public.invitations for select to authenticated using (
  player_id = auth.uid() or public.is_club_manager(club_id)
);
create policy "Managers send invitations" on public.invitations for insert to authenticated with check (
  invited_by = auth.uid() and public.is_club_manager(club_id)
  and not exists (select 1 from public.club_members where player_id = invitations.player_id)
);
create policy "Invitee responds to own invitation" on public.invitations for update to authenticated using (player_id = auth.uid()) with check (
  player_id = auth.uid() and status in ('accepted','declined')
);

create policy "Players and managers read join requests" on public.join_requests for select to authenticated using (
  player_id = auth.uid() or public.is_club_manager(club_id)
);
create policy "Players request to join" on public.join_requests for insert to authenticated with check (
  player_id = auth.uid() and not exists (select 1 from public.club_members where player_id = auth.uid())
);
create policy "Player cancels or manager reviews request" on public.join_requests for update to authenticated using (
  player_id = auth.uid() or public.is_club_manager(club_id)
) with check (
  (player_id = auth.uid() and status = 'cancelled') or
  (public.is_club_manager(club_id) and status in ('approved','rejected'))
);

create policy "Signed-in users read match results" on public.matches for select to authenticated using (true);
create policy "Club managers report matches" on public.matches for insert to authenticated with check (
  reported_by = auth.uid() and
  (public.is_club_manager(home_club_id) or public.is_club_manager(away_club_id))
);
create policy "Opponent manager confirms match" on public.matches for update to authenticated using (
  status in ('awaiting_confirmation','disputed') and
  auth.uid() <> reported_by and
  (public.is_club_manager(home_club_id) or public.is_club_manager(away_club_id))
) with check (status in ('approved','disputed','rejected'));


-- Allow a manager-approved join request to create membership.
create policy "Approved request can add requested player" on public.club_members for insert to authenticated with check (
  role = 'player'
  and exists (
    select 1 from public.join_requests jr
    where jr.club_id = club_members.club_id
      and jr.player_id = club_members.player_id
      and jr.status = 'approved'
  )
  and (public.is_club_manager(club_id) or player_id = auth.uid())
);
