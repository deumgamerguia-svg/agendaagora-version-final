alter table public.businesses
  add column if not exists whatsapp_instance text,
  add column if not exists whatsapp_status text not null default 'desconectado';