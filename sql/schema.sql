-- 数据表结构（按 PRD v0.5 第 5 节）
-- 在 Supabase SQL Editor 中整段执行。单场内部系统：已登录用户（authenticated）可读写。

-- ---------- 用户档案 ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'staff' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);

-- ---------- 字典 ----------
create table if not exists public.dict_items (
  id bigint generated always as identity primary key,
  category text not null,
  label text not null,
  sort int default 0
);

-- ---------- 巢箱 ----------
create table if not exists public.nests (
  id bigint generated always as identity primary key,
  code text not null unique,
  position text,
  status text not null default '空闲' check (status in ('空闲','占用','维修','停用')),
  note text,
  deleted boolean not null default false
);

-- ---------- 种鸟 ----------
create table if not exists public.birds (
  id bigint generated always as identity primary key,
  code text not null unique,
  band text unique,
  species text not null,
  variety text,
  gender text not null default '未知' check (gender in ('公','母','未知')),
  birth_date date,
  source text check (source in ('自繁','外购')),
  mate_id bigint references public.birds(id),
  father_id bigint references public.birds(id),
  mother_id bigint references public.birds(id),
  location text,
  status text not null default '在养',
  health_note text,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- 繁殖窝次 ----------
create table if not exists public.breedings (
  id bigint generated always as identity primary key,
  code text not null unique,
  nest_id bigint references public.nests(id),
  male_id bigint references public.birds(id),
  female_id bigint references public.birds(id),
  temp_label text,
  pair_date date,
  stage text not null default '配对' check (stage in ('配对','产蛋','孵化中','出壳','育雏中','断奶成活','失败')),
  terminated_reason text,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- 繁殖明细 ----------
create table if not exists public.breeding_details (
  id bigint generated always as identity primary key,
  breeding_id bigint not null references public.breedings(id) on delete cascade,
  laid_date date, egg_count int,
  candle_date date, fertile_count int,
  hatch_date date, hatch_count int,
  wean_date date, survived_count int, died_count int, death_reason text
);

-- ---------- 雏鸟 ----------
create table if not exists public.chicks (
  id bigint generated always as identity primary key,
  code text not null unique,
  breeding_id bigint references public.breedings(id),
  father_id bigint references public.birds(id),
  mother_id bigint references public.birds(id),
  species text, variety text, band text unique,
  gender text not null default '未知' check (gender in ('公','母','未知')),
  birth_date date,
  status text not null default '在养' check (status in ('在养','待售','已售','死亡','已转种鸟')),
  note text, deleted boolean not null default false
);

-- ---------- 验卡 ----------
create table if not exists public.sex_tests (
  id bigint generated always as identity primary key,
  lab text not null, test_date date not null,
  band text not null, variety text,
  gender text not null check (gender in ('公','母'))
);

-- ---------- 存栏与流水 ----------
create table if not exists public.inventory (
  id bigint generated always as identity primary key,
  species text not null, stage text not null, qty int not null default 0,
  unique(species, stage)
);
create table if not exists public.inventory_logs (
  id bigint generated always as identity primary key,
  species text, stage text, delta int, reason text, ref_no text,
  operator_id uuid references auth.users(id), created_at timestamptz not null default now()
);

-- ---------- 客户 / 订单 ----------
create table if not exists public.customers (
  id bigint generated always as identity primary key,
  name text, phone text, wechat text, address text, source text, note text,
  deleted boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  code text not null unique, customer_id bigint references public.customers(id),
  total numeric(12,2), order_date date not null default current_date,
  payment_status text default '未收' check (payment_status in ('未收','部分','已收','已取消')),
  payment_method text, delivery_method text, note text,
  deleted boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  species text, qty int, price numeric(12,2)
);
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  amount numeric(12,2), method text, paid_at timestamptz not null default now()
);

-- ---------- 采购 / 待办 / 设置 ----------
create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  type text, item text, qty numeric, price numeric, amount numeric,
  supplier text, purchase_date date, operator text, note text,
  deleted boolean not null default false
);
create table if not exists public.reminders (
  id bigint generated always as identity primary key,
  title text not null, type text, ref text, due_date date,
  done boolean not null default false, done_at timestamptz, note text
);
create table if not exists public.settings (
  id int primary key default 1, farm_name text, address text, phone text,
  check (id = 1)
);

-- ---------- RLS：单场，已登录用户可读写 ----------
alter table public.profiles enable row level security;
alter table public.dict_items enable row level security;
alter table public.nests enable row level security;
alter table public.birds enable row level security;
alter table public.breedings enable row level security;
alter table public.breeding_details enable row level security;
alter table public.chicks enable row level security;
alter table public.sex_tests enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_logs enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.purchases enable row level security;
alter table public.reminders enable row level security;
alter table public.settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','dict_items','nests','birds','breedings','breeding_details','chicks',
    'sex_tests','inventory','inventory_logs','customers','orders','order_items',
    'payments','purchases','reminders','settings'
  ] loop
    execute format('drop policy if exists "auth_all" on public.%I;', t);
    execute format('create policy "auth_all" on public.%I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
