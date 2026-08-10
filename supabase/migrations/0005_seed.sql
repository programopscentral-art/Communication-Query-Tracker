-- ============================================================================
-- 0005_seed.sql — universities (from the current tracker sheet) + dropdowns
-- Idempotent: safe to re-run. New universities normally arrive via the sheet
-- sync; this just bootstraps the ones already in use.
-- ============================================================================

insert into universities (name, code, aliases) values
  ('ADYPU',          'adypu',         array['ADYPU']),
  ('AMET',           'amet',          array['AMET']),
  ('Annamacharya',   'annamacharya',  array['Annamacharya']),
  ('Aurora',         'aurora',        array['Aurora','Aurora ']),
  ('CDU',            'cdu',           array['CDU']),
  ('Chalapathy',     'chalapathy',    array['Chalapathy']),
  ('Crescent',       'crescent',      array['Crescent']),
  ('KKH',            'kkh',           array['KKH']),
  ('MRV',            'mrv',           array['MRV']),
  ('NIAT-Chevella',  'niat-chevella', array['NIAT-Chevella','NIAT Chevella']),
  ('NIU',            'niu',           array['NIU']),
  ('NRI',            'nri',           array['NRI']),
  ('NSRIT',          'nsrit',         array['NSRIT']),
  ('S-Vyasa',        's-vyasa',       array['S-Vyasa','SVyasa','S Vyasa']),
  ('SGU',            'sgu',           array['SGU']),
  ('Takshasila',     'takshasila',    array['Takshasila']),
  ('VGU',            'vgu',           array['VGU']),
  ('Yenepoya',       'yenepoya',      array['Yenepoya','Yenepoya University','YEN'])
on conflict (code) do nothing;

-- Dropdown reference values (observed in the sheet; editable in Admin UI).
insert into ref_team (value, sort_order) values
  ('Student Engagement', 1), ('Parent Communication', 2)
on conflict (value) do nothing;

insert into ref_update_type (value, sort_order) values
  ('Positive Message', 1), ('Reminder', 2), ('Announcement', 3), ('Other', 9)
on conflict (value) do nothing;

insert into ref_category (value, sort_order) values
  ('Master class', 1), ('CP', 2), ('MINT', 3), ('Global Immersion', 4), ('Other', 9)
on conflict (value) do nothing;

insert into ref_channel (value, sort_order) values
  ('Student Whatsapp', 1), ('Parent Whatsapp', 2), ('Student App', 3), ('Parent App', 4)
on conflict (value) do nothing;

insert into ref_content_type (value, sort_order) values
  ('Markdown', 1), ('Plain Text', 2)
on conflict (value) do nothing;
