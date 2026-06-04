create table if not exists categories (
  id    text primary key,
  label text not null,
  emoji text,
  color text
);

create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  amount      numeric(14,2) not null,
  direction   text not null check (direction in ('debit','credit')),
  merchant    text,
  raw_text    text,
  source      text not null,
  account     text,
  category_id text references categories(id),
  confidence  numeric(3,2),
  dedup_key   text unique,
  created_at  timestamptz default now()
);
create index if not exists transactions_occurred_at_idx on transactions (occurred_at);
create index if not exists transactions_category_idx on transactions (category_id);

insert into categories (id, label, emoji, color) values
  ('food','Food','🍔','#FFD8C2'),
  ('travel','Travel','✈️','#FCEFB4'),
  ('clothing','Clothing','👕','#E3D5F1'),
  ('groceries','Groceries','🛒','#CDEAD9'),
  ('bills','Bills','🧾','#C7E0F4'),
  ('entertainment','Entertainment','🎬','#F7D6E0'),
  ('health','Health','💊','#D9EAD3'),
  ('transport','Transport','🚗','#FCE3C3'),
  ('shopping','Shopping','🛍️','#E0D7F5'),
  ('other','Other','❓','#E4E0D8')
on conflict (id) do nothing;
