-- Reference data. Everything here is editable later from the Settings page.

insert into departments (code, name, sort_order) values
  ('sales',          'Sales',               1),
  ('banquet',        'Banquet',             2),
  ('fnb',            'F&B Service',         3),
  ('kitchen',        'Kitchen',             4),
  ('housekeeping',   'Housekeeping',        5),
  ('engineering_it', 'Engineering & IT',    6),
  ('hr',             'HR',                  7),
  ('security',       'Security',            8),
  ('accounts',       'Accounts',            9)
on conflict (code) do nothing;

insert into venues (name, capacity) values
  ('Corniche 1', 60), ('Corniche 2', 40), ('Corniche 3', 25), ('Ballroom', 250), ('Boardroom', 14)
on conflict (name) do nothing;

insert into setup_styles (name) values
  ('Theatre'), ('Classroom'), ('U-shape'), ('Boardroom'), ('Cabaret'), ('Banquet rounds'), ('Cocktail')
on conflict (name) do nothing;

insert into settings (key, value) values
  ('hotel',          '{"name": "Holiday Inn Jeddah Corniche", "footer": "Function sheet - internal distribution"}'),
  ('vat_rate',       '15'),
  ('routing_mode',   '"by_content"'),      -- "all" = every department gets every sheet; "by_content" = only departments with requirements
  ('lead_minutes',   '30'),                -- default "ready by" = program start minus this
  ('feedback_edit_hours', '24'),
  ('survey_enabled', 'true')
on conflict (key) do nothing;

-- Sample function sheet (from the original Excel sheet) saved as a draft so you can submit it and see the flow.
with acc as (
  insert into accounts (name) values ('United Arab Emirates Football Association')
  on conflict (name) do update set name = excluded.name
  returning id
), ev as (
  insert into events (account_id, account_name, booking_name, event_type, description,
                      rate, pricing_unit, pricing_days, vat_rate, subtotal, vat_amount, total, deposit, payment_method)
  select id, 'United Arab Emirates Football Association', 'United Arab Emirates Football Association',
         'Meeting', 'Meeting and Lunch', 500, 'per_day', 2, 15, 1000, 150, 1150, 1150, 'Bank transfer'
  from acc
  returning id
), d1 as (
  insert into event_days (event_id, event_date, venue_id, venue_name, start_time, end_time, pax_guaranteed, pax_expected, setup_style, sort_order)
  select ev.id, date '2026-10-02', v.id, v.name, '11:00', '15:00', 35, 35, 'U-shape', 0
  from ev, venues v where v.name = 'Corniche 2'
  returning id, event_id
), d2 as (
  insert into event_days (event_id, event_date, venue_id, venue_name, start_time, end_time, pax_guaranteed, pax_expected, setup_style, sort_order)
  select ev.id, date '2026-10-03', v.id, v.name, '11:00', '15:00', 35, 35, 'U-shape', 1
  from ev, venues v where v.name = 'Corniche 2'
  returning id, event_id
), f as (
  insert into event_fnb_items (event_id, event_day_id, serve_time, item, pax, sort_order)
  select event_id, id, time '11:00', 'Water', 35, 0 from d1
  union all select event_id, id, time '13:00', 'Lunch', 35, 1 from d1
  union all select event_id, id, time '11:00', 'Water', 35, 0 from d2
  union all select event_id, id, time '13:00', 'Lunch', 35, 1 from d2
  returning 1
)
insert into department_notes (event_id, department_code, notes, not_required, ready_by)
select ev.id, 'housekeeping', 'Venue ready', false, time '12:00' from ev
union all select ev.id, 'hr', null, true, null::time from ev;
