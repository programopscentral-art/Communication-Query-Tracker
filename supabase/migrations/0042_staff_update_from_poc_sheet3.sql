-- ============================================================================
-- 0042_staff_update_from_poc_sheet3.sql — Phase 2 staff update (DATA ONLY).
-- Source of truth: the "Sheet3" tab of the campus POC sheet (read 2026-11-27).
-- Staff are updated IN PLACE (matched by Employee ID, then email); nobody is deleted.
--  • BOA / PMA → active, receive reminders ON · PM / COS → active, receive reminders OFF
--  • Central team, Student engagement team, APMs → not university staff (skipped)
--  • PingBoard staff not in Sheet3 → deactivated, reminders OFF
--  • Test University's setup untouched
-- Plan: 13 added · 64 updated (3 moved university) · 10 deactivated.
-- Full plan: C:\Users\Asus\Documents\PingBoard-backups\staff-2026-11-27\
-- Every statement checks its exact row count and aborts the whole migration otherwise.
-- Reminder regeneration fired by these writes only touches FUTURE posts.
-- Snapshot: C:\Users\Asus\Documents\PingBoard-backups\snapshot-0042-before.json
-- Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0042.sql
-- ============================================================================

-- add Syed Abdul Hadi (NW0004588) → NIAT-Chevella BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0004588', 'Syed Abdul Hadi', 'BOA', 'syed.abdulhadi@nxtwave.co.in', '+919121538726', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Syed Abdul Hadi (NW0004588) → NIAT-Chevella BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Syed Abdul Hadi → NIAT-Chevella
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select 'eed06f54-4ec6-43da-9382-ceb4aefc3279', id, 'primary', '', true from boas where employee_id = 'NW0004588';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Syed Abdul Hadi → NIAT-Chevella: expected 1 rows, got %', n; end if;
end $$;

-- update Akhilesh Kola (NW0006890)
do $$ declare n int; begin
  update boas set designation = 'BOA' where id = '6581709a-995e-4f87-a2cb-fee09fdb1735';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Akhilesh Kola (NW0006890): expected 1 rows, got %', n; end if;
end $$;

-- update Mohammed Ayaan (NW0006905)
do $$ declare n int; begin
  update boas set designation = 'BOA' where id = '34e9c383-86aa-4221-a783-0b5181e550e0';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Mohammed Ayaan (NW0006905): expected 1 rows, got %', n; end if;
end $$;

-- update Vijay Mithari (PM) (NW0005079)
do $$ declare n int; begin
  update boas set name = 'Vijay Mithari' where id = 'cc4f8ace-ee19-4928-a42a-5b750132b6a8';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Vijay Mithari (PM) (NW0005079): expected 1 rows, got %', n; end if;
end $$;

-- Vijay Mithari (PM) @ SGU: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'cc4f8ace-ee19-4928-a42a-5b750132b6a8' and university_id = '7d5b0424-4861-409f-91fe-836ba434ef76';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Vijay Mithari (PM) @ SGU: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Deepak Sharma (NW0006199)
do $$ declare n int; begin
  update boas set employee_id = 'NW0007164', email = 'sharma.deepak@nxtwave.co.in', designation = 'PMA' where id = 'b6221e96-cf5e-438b-bc23-652c072a9cfd';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Deepak Sharma (NW0006199): expected 1 rows, got %', n; end if;
end $$;

-- update R pravin (NW0005178)
do $$ declare n int; begin
  update boas set name = 'Pravin R' where id = 'b66263e1-5f81-44e1-9136-301954036ba9';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update R pravin (NW0005178): expected 1 rows, got %', n; end if;
end $$;

-- update S O Sulthana (NW0005085)
do $$ declare n int; begin
  update boas set name = 'Sulthana S O' where id = '6b1a41e2-3c8b-4776-acce-21a8760ff6d9';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update S O Sulthana (NW0005085): expected 1 rows, got %', n; end if;
end $$;

-- add Swathi Sri S (NW0004819) → Takshashila BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0004819', 'Swathi Sri S', 'BOA', 'swathisri.srinivasaraghavan@nxtwave.co.in', '+917010746949', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Swathi Sri S (NW0004819) → Takshashila BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Swathi Sri S → Takshashila
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select '8fcfaf66-c864-4b4d-af1e-346df171803b', id, 'primary', '', true from boas where employee_id = 'NW0004819';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Swathi Sri S → Takshashila: expected 1 rows, got %', n; end if;
end $$;

-- update A M Nymisha (NW0004940)
do $$ declare n int; begin
  update boas set name = 'Nymisha', designation = 'PM' where id = '472e9a84-f74a-4a32-bf7a-69629a9b77fc';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update A M Nymisha (NW0004940): expected 1 rows, got %', n; end if;
end $$;

-- move A M Nymisha: remove old university link(s)
do $$ declare n int; begin
  delete from university_boas where boa_id = '472e9a84-f74a-4a32-bf7a-69629a9b77fc' and university_id in ('8fcfaf66-c864-4b4d-af1e-346df171803b');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'move A M Nymisha: remove old university link(s): expected 1 rows, got %', n; end if;
end $$;

-- link A M Nymisha → AMET
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) values ('5e45403d-46ec-46f9-9129-66aee58b8c32', '472e9a84-f74a-4a32-bf7a-69629a9b77fc', 'primary', '', false);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link A M Nymisha → AMET: expected 1 rows, got %', n; end if;
end $$;

-- update Gokulkrishna (NW0005692)
do $$ declare n int; begin
  update boas set name = 'Gokul krishna' where id = 'dfeba8ff-1e0a-4cc5-b339-be92096c5fd8';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Gokulkrishna (NW0005692): expected 1 rows, got %', n; end if;
end $$;

-- add Mathana Rahul (NW0007294) → AMET BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0007294', 'Mathana Rahul', 'BOA', 'mathana.rahulk@nxtwave.co.in', '+916374410980', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Mathana Rahul (NW0007294) → AMET BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Mathana Rahul → AMET
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select '5e45403d-46ec-46f9-9129-66aee58b8c32', id, 'primary', '', true from boas where employee_id = 'NW0007294';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Mathana Rahul → AMET: expected 1 rows, got %', n; end if;
end $$;

-- update Pavan (NW0004577)
do $$ declare n int; begin
  update boas set name = 'Kola Pavan Kumar' where id = '7a413695-01f4-42a3-ab24-1e7b3d353bc5';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Pavan (NW0004577): expected 1 rows, got %', n; end if;
end $$;

-- update JAGADEESH KUMAR MUTTAMSETTI (NW0007109)
do $$ declare n int; begin
  update boas set name = 'Muttamsetti Jagadeesh Kumar', email = 'muttamsetti.jagadeeshkumar@nxtwave.co.in', designation = 'BOA' where id = 'f45c8023-d72b-47fe-8d77-b0006eac91f5';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update JAGADEESH KUMAR MUTTAMSETTI (NW0007109): expected 1 rows, got %', n; end if;
end $$;

-- update Akshaya C (NW0007103)
do $$ declare n int; begin
  update boas set designation = 'BOA' where id = 'ee7a28a7-4870-4494-8cea-d6dc3df71c7d';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Akshaya C (NW0007103): expected 1 rows, got %', n; end if;
end $$;

-- add Thilak S (NW0007004) → JOY (Chennai) BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0007004', 'Thilak S', 'BOA', 'thilak.s@nxtwave.co.in', '+919345713621', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Thilak S (NW0007004) → JOY (Chennai) BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Thilak S → JOY (Chennai)
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select 'eabd3635-34ce-472d-b8dc-15332fa3c463', id, 'primary', '', true from boas where employee_id = 'NW0007004';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Thilak S → JOY (Chennai): expected 1 rows, got %', n; end if;
end $$;

-- update Maharaja Rajesh C (NW0006984)
do $$ declare n int; begin
  update boas set designation = 'BOA' where id = '9e5416e1-75eb-443c-a36b-34056a4b6420';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Maharaja Rajesh C (NW0006984): expected 1 rows, got %', n; end if;
end $$;

-- Neha Shahid Shaikh @ ADYPU: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'fdbc27b3-9d33-457d-a6c4-3d1d62985df1' and university_id = '41fe1b01-221d-45b1-8a5b-b5f042b9c6bb';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Neha Shahid Shaikh @ ADYPU: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Kodam Vignesh (NW0005182)
do $$ declare n int; begin
  update boas set designation = 'PM' where id = '6eb3d791-0082-47b4-83ac-f49c76b587f0';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Kodam Vignesh (NW0005182): expected 1 rows, got %', n; end if;
end $$;

-- Kodam Vignesh @ Annamacharya: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '6eb3d791-0082-47b4-83ac-f49c76b587f0' and university_id = '8bdfd6c3-1d8f-4238-baf4-3bbec045b99f';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Kodam Vignesh @ Annamacharya: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Arlaiah (NW0000401)
do $$ declare n int; begin
  update boas set name = 'Peda Arlaiah Jada' where id = '82047d3e-5522-4556-8c77-35256ef3d40c';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Arlaiah (NW0000401): expected 1 rows, got %', n; end if;
end $$;

-- Arlaiah @ Chalapathy: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '82047d3e-5522-4556-8c77-35256ef3d40c' and university_id = '5ffcd0a3-e5c5-4da3-9db5-0ef2c6e46434';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Arlaiah @ Chalapathy: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Sandeep (NW0005154)
do $$ declare n int; begin
  update boas set name = 'Banda Sandeep' where id = 'a24fe446-2b6d-4abe-bb7f-f7f38472b4a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Sandeep (NW0005154): expected 1 rows, got %', n; end if;
end $$;

-- Sandeep @ Aurora: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'a24fe446-2b6d-4abe-bb7f-f7f38472b4a1' and university_id = '45dd71da-5e29-4493-a0ed-28a0062ca5d0';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Sandeep @ Aurora: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Shanthan Singam (NW00002536)
do $$ declare n int; begin
  update boas set employee_id = 'NW0002536' where id = '70df9be9-76c3-455f-9ec4-22311e01ab8b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Shanthan Singam (NW00002536): expected 1 rows, got %', n; end if;
end $$;

-- Shanthan Singam @ CDU: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '70df9be9-76c3-455f-9ec4-22311e01ab8b' and university_id = '74b9ff77-3f49-448b-9ee9-6dd6f93a9a9e';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Shanthan Singam @ CDU: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- add Shivika Shrivastava (NW0004587) → KKH COS
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0004587', 'Shivika Shrivastava', 'COS', 'shivika.surendrashrivastava@nxtwave.co.in', '+918421438608', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Shivika Shrivastava (NW0004587) → KKH COS: expected 1 rows, got %', n; end if;
end $$;

-- link Shivika Shrivastava → KKH
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select 'df8cf8df-255c-43b4-8a06-12544c5c5e5f', id, 'primary', '', false from boas where employee_id = 'NW0004587';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Shivika Shrivastava → KKH: expected 1 rows, got %', n; end if;
end $$;

-- update Manideep Reddy Irupaka (NW0004166)
do $$ declare n int; begin
  update boas set name = 'Irupaka Manideep Reddy', email = 'manideepreddy.irupaka@nxtwave.co.in' where id = '3fcb4ffc-002f-4e4a-8bf0-74df8c8fa375';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Manideep Reddy Irupaka (NW0004166): expected 1 rows, got %', n; end if;
end $$;

-- Manideep Reddy Irupaka @ MRV: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '3fcb4ffc-002f-4e4a-8bf0-74df8c8fa375' and university_id = 'ca4738c9-8e45-41a9-8174-3eb38fffbf1b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Manideep Reddy Irupaka @ MRV: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- Gaurav Singh @ NIU: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'b28b11bd-097b-41d5-a64f-5e4c8d9c4d21' and university_id = '968445dc-e06a-4c29-b906-57f5023a2535';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Gaurav Singh @ NIU: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Manoj Kumar (NW0005208)
do $$ declare n int; begin
  update boas set name = 'Kandregula Manoj Kumar' where id = '8b632708-ff9a-4ff7-8811-3e87448aad5c';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Manoj Kumar (NW0005208): expected 1 rows, got %', n; end if;
end $$;

-- Manoj Kumar @ NRI: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '8b632708-ff9a-4ff7-8811-3e87448aad5c' and university_id = '32845c44-6182-49e4-b426-134cc2c7ed62';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Manoj Kumar @ NRI: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- Varsha Mahesh @ S-Vyasa: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '38e52dd2-2c36-4198-bc5f-84f17bf77b75' and university_id = 'ec98af48-8e27-4ea9-8b33-5936fce4ca7a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Varsha Mahesh @ S-Vyasa: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- Aparajita Negi @ VGU: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '0a00fa87-1213-45fe-8cfc-47f1780e1af8' and university_id = 'fd0c0546-e2c7-4e30-94d6-86d4d0567385';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Aparajita Negi @ VGU: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- move Srisailachari Kammara: remove old university link(s)
do $$ declare n int; begin
  delete from university_boas where boa_id = 'b5acf71b-52d6-42b3-9d8c-ab4d9c05157d' and university_id in ('ec98af48-8e27-4ea9-8b33-5936fce4ca7a');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'move Srisailachari Kammara: remove old university link(s): expected 1 rows, got %', n; end if;
end $$;

-- link Srisailachari Kammara → Yenepoya
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) values ('d34acb57-b515-4a36-9060-9ba811190c4b', 'b5acf71b-52d6-42b3-9d8c-ab4d9c05157d', 'primary', '', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Srisailachari Kammara → Yenepoya: expected 1 rows, got %', n; end if;
end $$;

-- update Yerrappagari Bayanna (NW0007000)
do $$ declare n int; begin
  update boas set email = 'yerrappagari.bayanna@nxtwave.co.in', designation = 'BOA' where id = 'f7bd2775-4320-428b-a8c7-dd398181c4dd';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Yerrappagari Bayanna (NW0007000): expected 1 rows, got %', n; end if;
end $$;

-- add Saragadam Nagendra Venkata Sri Sai Naidu (NW0007803) → Yenepoya BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0007803', 'Saragadam Nagendra Venkata Sri Sai Naidu', 'BOA', 'venkata.srisainaidu@nxtwave.co.in', '+919121523371', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Saragadam Nagendra Venkata Sri Sai Naidu (NW0007803) → Yenepoya BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Saragadam Nagendra Venkata Sri Sai Naidu → Yenepoya
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select 'd34acb57-b515-4a36-9060-9ba811190c4b', id, 'primary', '', true from boas where employee_id = 'NW0007803';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Saragadam Nagendra Venkata Sri Sai Naidu → Yenepoya: expected 1 rows, got %', n; end if;
end $$;

-- update Shruthi (NW0004842)
do $$ declare n int; begin
  update boas set name = 'Shruthi S S' where id = 'f4daa452-3b8f-4b04-931f-b2463f0ca30d';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Shruthi (NW0004842): expected 1 rows, got %', n; end if;
end $$;

-- update BHARATH S (NW0007003)
do $$ declare n int; begin
  update boas set name = 'Bharath S', designation = 'BOA' where id = '62124c71-445b-4eb1-bd5b-51283aa805a6';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update BHARATH S (NW0007003): expected 1 rows, got %', n; end if;
end $$;

-- add Anto Maria Sherena (NW0006904) → Crescent BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0006904', 'Anto Maria Sherena', 'BOA', 'anto.mariasherenam@nxtwave.co.in', '+919944357012', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Anto Maria Sherena (NW0006904) → Crescent BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Anto Maria Sherena → Crescent
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select '4dd83866-4fd7-42a7-af30-d0607f9744a6', id, 'primary', '', true from boas where employee_id = 'NW0006904';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Anto Maria Sherena → Crescent: expected 1 rows, got %', n; end if;
end $$;

-- update Yash (NW0005007)
do $$ declare n int; begin
  update boas set name = 'Yash sanjay Otari', email = 'yashsanjay.otari@nxtwave.co.in', designation = 'BOA' where id = 'a1a7cfae-8d2a-4951-9679-1a2ed6e2c589';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Yash (NW0005007): expected 1 rows, got %', n; end if;
end $$;

-- update Aayush Singh ((NW0007175)
do $$ declare n int; begin
  update boas set employee_id = 'NW0007175', email = 'aayush.singh@nxtwave.co.in', designation = 'BOA' where id = '609a50ce-b657-4f1e-9a6e-395f1bff2ce5';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Aayush Singh ((NW0007175): expected 1 rows, got %', n; end if;
end $$;

-- add Sarish Nitin Chachare (NW0007199) → ADYPU BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0007199', 'Sarish Nitin Chachare', 'BOA', 'sarish.nitinchachare@nxtwave.co.in', '+919623332369', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Sarish Nitin Chachare (NW0007199) → ADYPU BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Sarish Nitin Chachare → ADYPU
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select '41fe1b01-221d-45b1-8a5b-b5f042b9c6bb', id, 'primary', '', true from boas where employee_id = 'NW0007199';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Sarish Nitin Chachare → ADYPU: expected 1 rows, got %', n; end if;
end $$;

-- update Gompa Poojitha (NW0006888)
do $$ declare n int; begin
  update boas set designation = 'BOA' where id = '1308d5c6-9ea5-41c4-b5c8-6847be5ce9f2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Gompa Poojitha (NW0006888): expected 1 rows, got %', n; end if;
end $$;

-- update Powaku Sai Aashray (NW0006909)
do $$ declare n int; begin
  update boas set designation = 'BOA' where id = '16184e8f-fd98-46e1-9932-dec50f0c847b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Powaku Sai Aashray (NW0006909): expected 1 rows, got %', n; end if;
end $$;

-- update SAI KOTTURU (NW0007110)
do $$ declare n int; begin
  update boas set name = 'Kotturu Sai', email = 'kotturu.sai@nxtwave.co.in', designation = 'BOA' where id = 'b4f83fa3-fe35-4d94-a1a3-d7bfe1e07aec';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update SAI KOTTURU (NW0007110): expected 1 rows, got %', n; end if;
end $$;

-- Sabbavarapu Lalitha @ NSRIT: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '94795c0f-ca28-4f80-9c3c-61038687a77e' and university_id = 'b8b8dcc3-de68-4837-8c82-87b72b5cd4ed';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Sabbavarapu Lalitha @ NSRIT: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Gowri Durga (NW0004673)
do $$ declare n int; begin
  update boas set name = 'Narim Gowri Durga', email = 'gowridurga.narim@nxtwave.co.in' where id = '38b24de2-0164-4173-be5e-6d9150f6f8f4';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Gowri Durga (NW0004673): expected 1 rows, got %', n; end if;
end $$;

-- update Krishnaja (NW0004525)
do $$ declare n int; begin
  update boas set name = 'Krishnaja Varma' where id = 'fab9e9d1-a520-4341-a14c-92e7ff4f162d';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Krishnaja (NW0004525): expected 1 rows, got %', n; end if;
end $$;

-- Krishnaja @ Crescent: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'fab9e9d1-a520-4341-a14c-92e7ff4f162d' and university_id = '4dd83866-4fd7-42a7-af30-d0607f9744a6';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Krishnaja @ Crescent: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Gastel Thomas BU (NW0004823)
do $$ declare n int; begin
  update boas set name = 'Gastel Thomas B U', designation = 'PM' where id = 'cff09793-a4fc-4ca7-9a12-bcf67e7c1018';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Gastel Thomas BU (NW0004823): expected 1 rows, got %', n; end if;
end $$;

-- Gastel Thomas BU @ JOY (Chennai): reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'cff09793-a4fc-4ca7-9a12-bcf67e7c1018' and university_id = 'eabd3635-34ce-472d-b8dc-15332fa3c463';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Gastel Thomas BU @ JOY (Chennai): reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Ashwath (NW0004746)
do $$ declare n int; begin
  update boas set name = 'Ashwath Narayan VP' where id = 'c95f5509-cbfd-475b-b247-6052d7ff46ea';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Ashwath (NW0004746): expected 1 rows, got %', n; end if;
end $$;

-- Ashwath @ Takshashila: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'c95f5509-cbfd-475b-b247-6052d7ff46ea' and university_id = '8fcfaf66-c864-4b4d-af1e-346df171803b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Ashwath @ Takshashila: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Manish S (NW0006907)
do $$ declare n int; begin
  update boas set email = 'manish.s@nxtwave.co.in', designation = 'BOA' where id = '812e3c8a-a280-4385-81f8-652e5076bd94';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Manish S (NW0006907): expected 1 rows, got %', n; end if;
end $$;

-- update Annavarapu Srinadh (NW0007106)
do $$ declare n int; begin
  update boas set name = 'Srinadh Annavarapu', email = 'annavarapu.srinadh@nxtwave.co.in', designation = 'BOA' where id = '9f36749b-5c9c-40a3-948e-b6c1cadacf21';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Annavarapu Srinadh (NW0007106): expected 1 rows, got %', n; end if;
end $$;

-- update Nalla Deepika (NW0006893)
do $$ declare n int; begin
  update boas set designation = 'BOA' where id = 'f5dafc31-b52f-4e1c-8849-20cdc0b784f9';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Nalla Deepika (NW0006893): expected 1 rows, got %', n; end if;
end $$;

-- update Kondapalli Nikhita (NW0005213)
do $$ declare n int; begin
  update boas set name = 'Kondapalli Nikitha' where id = '61548b89-0cba-470c-a029-153e2913fab8';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Kondapalli Nikhita (NW0005213): expected 1 rows, got %', n; end if;
end $$;

-- update Nayab Rasool Shaik (NW0006887)
do $$ declare n int; begin
  update boas set name = 'Shaik Nayab Rasool', designation = 'BOA' where id = 'dfa9371f-efbf-4020-85d7-6dfcc4399380';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Nayab Rasool Shaik (NW0006887): expected 1 rows, got %', n; end if;
end $$;

-- update Sairam Reddy Rajigiri (NW0006889)
do $$ declare n int; begin
  update boas set designation = 'BOA' where id = 'a2c97cfa-9f29-4e0a-b378-423f3f9a1171';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Sairam Reddy Rajigiri (NW0006889): expected 1 rows, got %', n; end if;
end $$;

-- add Peddhi Snehal Kumar (NW0004573) → KKH BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0004573', 'Peddhi Snehal Kumar', 'BOA', 'peddhi.snehalkumar@nxtwave.co.in', '+917993438029', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Peddhi Snehal Kumar (NW0004573) → KKH BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Peddhi Snehal Kumar → KKH
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select 'df8cf8df-255c-43b4-8a06-12544c5c5e5f', id, 'primary', '', true from boas where employee_id = 'NW0004573';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Peddhi Snehal Kumar → KKH: expected 1 rows, got %', n; end if;
end $$;

-- add Mokkapati Anand (NW0003755) → KKH BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0003755', 'Mokkapati Anand', 'BOA', 'mokkapati.anand@nxtwave.co.in', '+918106143885', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Mokkapati Anand (NW0003755) → KKH BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Mokkapati Anand → KKH
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select 'df8cf8df-255c-43b4-8a06-12544c5c5e5f', id, 'primary', '', true from boas where employee_id = 'NW0003755';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Mokkapati Anand → KKH: expected 1 rows, got %', n; end if;
end $$;

-- update Harsha V Naidu (NW0007141)
do $$ declare n int; begin
  update boas set name = 'Harsha V', designation = 'BOA' where id = '6dddfc96-2f6f-4808-86cf-8e7e7f118680';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Harsha V Naidu (NW0007141): expected 1 rows, got %', n; end if;
end $$;

-- update Likith Gowda (NW0007099)
do $$ declare n int; begin
  update boas set name = 'Likith Gowda K S', designation = 'PMA' where id = '59bef73f-aeb6-435c-bba9-6252efd73ab7';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Likith Gowda (NW0007099): expected 1 rows, got %', n; end if;
end $$;

-- Kaushik A @ Yenepoya: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'a31ab4fa-59f7-43a4-a0c2-6649ab24d845' and university_id = 'd34acb57-b515-4a36-9060-9ba811190c4b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Kaushik A @ Yenepoya: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Nawaz (PM) (NW0004946)
do $$ declare n int; begin
  update boas set name = 'Nawaz' where id = '71d85786-6dda-4148-befe-2f53c9fb2cd4';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Nawaz (PM) (NW0004946): expected 1 rows, got %', n; end if;
end $$;

-- Nawaz (PM) @ Yenepoya: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '71d85786-6dda-4148-befe-2f53c9fb2cd4' and university_id = 'd34acb57-b515-4a36-9060-9ba811190c4b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Nawaz (PM) @ Yenepoya: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- update Kamasani Giridhar Reddy (NW0004924)
do $$ declare n int; begin
  update boas set email = 'giridharreddy.kamasani@nxtwave.co.in' where id = '20d72b42-459d-4c74-90bc-381e101df173';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Kamasani Giridhar Reddy (NW0004924): expected 1 rows, got %', n; end if;
end $$;

-- update Teja Kumar Mamidisetti (NW0007139)
do $$ declare n int; begin
  update boas set name = 'Mamidisetti Teja Kumar', email = 'mamidisetti.tejakumar@nxtwave.co.in', designation = 'BOA' where id = 'e5d7423c-776d-4709-b85b-e9ef07e6e488';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Teja Kumar Mamidisetti (NW0007139): expected 1 rows, got %', n; end if;
end $$;

-- update Sonali Eknath Zote (NW0004830)
do $$ declare n int; begin
  update boas set name = 'Sonali Zote' where id = 'e386baa9-b439-404d-8003-8f2b9adb0bc4';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Sonali Eknath Zote (NW0004830): expected 1 rows, got %', n; end if;
end $$;

-- update Swapnil Jagtap (NW0007176)
do $$ declare n int; begin
  update boas set designation = 'BOA' where id = 'd478a297-5412-49ff-9da6-517679382c02';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Swapnil Jagtap (NW0007176): expected 1 rows, got %', n; end if;
end $$;

-- update Aditya Anil Etavadekar (NW0007101)
do $$ declare n int; begin
  update boas set name = 'Aditya Etavadekar', designation = 'PMA' where id = '846c50f6-d426-4b13-bcb4-003ad9d83a90';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Aditya Anil Etavadekar (NW0007101): expected 1 rows, got %', n; end if;
end $$;

-- add Palleti Karunakar Reddy (NW0007508) → MRV PMA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0007508', 'Palleti Karunakar Reddy', 'PMA', 'palleti.karunakarreddy@nxtwave.co.in', '+919000102005', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Palleti Karunakar Reddy (NW0007508) → MRV PMA: expected 1 rows, got %', n; end if;
end $$;

-- link Palleti Karunakar Reddy → MRV
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select 'ca4738c9-8e45-41a9-8174-3eb38fffbf1b', id, 'primary', '', true from boas where employee_id = 'NW0007508';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Palleti Karunakar Reddy → MRV: expected 1 rows, got %', n; end if;
end $$;

-- add Kucharlapati Sai Thrishal Varma (NW0007502) → MRV BOA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0007502', 'Kucharlapati Sai Thrishal Varma', 'BOA', 'kucharlapati.saithrishalvarma@nxtwave.co.in', '+919392350480', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Kucharlapati Sai Thrishal Varma (NW0007502) → MRV BOA: expected 1 rows, got %', n; end if;
end $$;

-- link Kucharlapati Sai Thrishal Varma → MRV
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select 'ca4738c9-8e45-41a9-8174-3eb38fffbf1b', id, 'primary', '', true from boas where employee_id = 'NW0007502';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Kucharlapati Sai Thrishal Varma → MRV: expected 1 rows, got %', n; end if;
end $$;

-- add Preethi G (NW0007564) → Takshashila PMA
do $$ declare n int; begin
  insert into boas (employee_id, name, designation, email, whatsapp_e164, active) values ('NW0007564', 'Preethi G', 'PMA', 'preethi.g@nxtwave.co.in', '+918148859989', true);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'add Preethi G (NW0007564) → Takshashila PMA: expected 1 rows, got %', n; end if;
end $$;

-- link Preethi G → Takshashila
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) select '8fcfaf66-c864-4b4d-af1e-346df171803b', id, 'primary', '', true from boas where employee_id = 'NW0007564';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Preethi G → Takshashila: expected 1 rows, got %', n; end if;
end $$;

-- update Anand (NW0007013)
do $$ declare n int; begin
  update boas set name = 'Anand Talambrala teja', email = 'anand.talambralateja@nxtwave.co.in' where id = 'c5449279-8928-4066-8a00-3b694ee45458';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update Anand (NW0007013): expected 1 rows, got %', n; end if;
end $$;

-- move Anand: remove old university link(s)
do $$ declare n int; begin
  delete from university_boas where boa_id = 'c5449279-8928-4066-8a00-3b694ee45458' and university_id in ('eed06f54-4ec6-43da-9382-ceb4aefc3279');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'move Anand: remove old university link(s): expected 1 rows, got %', n; end if;
end $$;

-- link Anand → MRV
do $$ declare n int; begin
  insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders) values ('ca4738c9-8e45-41a9-8174-3eb38fffbf1b', 'c5449279-8928-4066-8a00-3b694ee45458', 'primary', '', false);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'link Anand → MRV: expected 1 rows, got %', n; end if;
end $$;

-- deactivate Kotha Loknadh (NW0004585)
do $$ declare n int; begin
  update boas set active = false where id = 'f523b53e-6f23-49c5-b2d8-65233d1fe4ae';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'deactivate Kotha Loknadh (NW0004585): expected 1 rows, got %', n; end if;
end $$;

-- Kotha Loknadh: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'f523b53e-6f23-49c5-b2d8-65233d1fe4ae' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Kotha Loknadh: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- deactivate Uppunuri Ganesh Reddy (NW0006947)
do $$ declare n int; begin
  update boas set active = false where id = 'acd6f090-2cfb-4897-aba1-ba037b9c27e9';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'deactivate Uppunuri Ganesh Reddy (NW0006947): expected 1 rows, got %', n; end if;
end $$;

-- Uppunuri Ganesh Reddy: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'acd6f090-2cfb-4897-aba1-ba037b9c27e9' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Uppunuri Ganesh Reddy: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- deactivate Satish S (NW0007142)
do $$ declare n int; begin
  update boas set active = false where id = 'b13d6599-6081-4e12-a938-0276622616d8';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'deactivate Satish S (NW0007142): expected 1 rows, got %', n; end if;
end $$;

-- Satish S: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'b13d6599-6081-4e12-a938-0276622616d8' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Satish S: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- deactivate Tejaswini (NW0004922)
do $$ declare n int; begin
  update boas set active = false where id = '4fc6e2d6-9b29-41a9-8069-477c230c0d02';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'deactivate Tejaswini (NW0004922): expected 1 rows, got %', n; end if;
end $$;

-- Tejaswini: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '4fc6e2d6-9b29-41a9-8069-477c230c0d02' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Tejaswini: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- deactivate Geya Gangavarapu (NW0006985)
do $$ declare n int; begin
  update boas set active = false where id = '3499e420-0708-45e2-a3c7-95fd2d4eb270';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'deactivate Geya Gangavarapu (NW0006985): expected 1 rows, got %', n; end if;
end $$;

-- Geya Gangavarapu: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '3499e420-0708-45e2-a3c7-95fd2d4eb270' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Geya Gangavarapu: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- deactivate Gyan Prakash Tiwari (NW0005049)
do $$ declare n int; begin
  update boas set active = false where id = 'b98bc9f6-e9b9-49b8-b746-b2d385345d39';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'deactivate Gyan Prakash Tiwari (NW0005049): expected 1 rows, got %', n; end if;
end $$;

-- Gyan Prakash Tiwari: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'b98bc9f6-e9b9-49b8-b746-b2d385345d39' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Gyan Prakash Tiwari: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- deactivate Harishma cs (NW0005074)
do $$ declare n int; begin
  update boas set active = false where id = '2d9ec390-3027-439b-b139-4613cea69b4f';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'deactivate Harishma cs (NW0005074): expected 1 rows, got %', n; end if;
end $$;

-- Harishma cs: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '2d9ec390-3027-439b-b139-4613cea69b4f' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Harishma cs: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- deactivate Shorya Pratap Singh (NW0004927)
do $$ declare n int; begin
  update boas set active = false where id = 'aa9dcccb-aa91-47c5-a07f-f76b1905ba9e';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'deactivate Shorya Pratap Singh (NW0004927): expected 1 rows, got %', n; end if;
end $$;

-- Shorya Pratap Singh: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = 'aa9dcccb-aa91-47c5-a07f-f76b1905ba9e' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Shorya Pratap Singh: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- deactivate Vrushali Nandkishor Lobhe (NW0004828)
do $$ declare n int; begin
  update boas set active = false where id = '87f84760-77a0-49f4-bb2b-39b42959a62c';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'deactivate Vrushali Nandkishor Lobhe (NW0004828): expected 1 rows, got %', n; end if;
end $$;

-- Vrushali Nandkishor Lobhe: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '87f84760-77a0-49f4-bb2b-39b42959a62c' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Vrushali Nandkishor Lobhe: reminders off: expected 1 rows, got %', n; end if;
end $$;
