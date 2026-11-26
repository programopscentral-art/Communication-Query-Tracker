-- ============================================================================
-- 0041_cleanup_test_data_and_duplicates.sql — Phase 1 cleanup approved by the user
-- on 2026-11-26 (audit: PingBoard-backups/audit-2026-11-26/REPORT.md). DATA ONLY.
--
--  1. 54 posts made in the app (all tests)                    → deleted
--  2. 135 stale duplicate copies of sheet rows                → deleted
--     Each one's key was checked against the LIVE sheet on 2026-11-26: none is
--     in the sheet any more, so the sync won't re-create them. NIU 10 Nov 13:45:
--     the OLD copy (d9498fce…, published) is the live one, so the NEWER pending
--     copy (f0810eaf…) is the one deleted. S-Vyasa sheet row 10652: its 2 older
--     copies (8 Oct 12:40 “Comeback Hero”, 8 Oct 14:50 “Riddle Time”) are deleted
--     and the 9 Oct 10:00 copy — the one in the sheet — is kept (user, 2026-11-26).
--  3. 25 events made in the app (all tests; "NAITRA" at ADYPU is kept)
--  4. all 5 announcements, the 2 test tickets, test staff "Ravi"
--  5. universities "Testing University" and "Central Testing" (after 1–4)
--  6. S Meena (inactive, NIAT-Chevella): receive reminders OFF
--
-- Side effects: deleting a post deletes its reminders (FK cascade) and its
-- task_sheet_state row (cascade), and writes ONE History entry ("deleted",
-- actor System). Nothing else writes History. Every step checks its exact row
-- count and aborts the whole migration if anything differs.
-- Snapshot: C:\Users\Asus\Documents\PingBoard-backups\snapshot-0041-before.json
-- Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0041.sql
-- ============================================================================

-- 1. 54 in-app test posts
do $$ declare n int; begin
  delete from tasks where origin = 'ui' and id = any(array[
    '09fc1c4d-ab67-4a87-a500-a467779aea1b', '0f387c6e-6ca1-4816-8217-d82810cd1c5d', '11e09499-5f45-4f14-a0b1-2d6ec3da0bcd', '39470679-bdaa-4e06-8157-bd77902f7a9f',
    '3ee1c0c7-cd3b-4477-af35-69f74471003a', '5060d5ef-959b-42de-8919-3432e4986ea9', '5faf9493-ff50-44b9-8512-19f54cfa5478', '5fd79006-2da5-4de5-bfe6-fca303f42268',
    '8a295ac7-9eba-4dec-8abc-a660baed7c9a', '8d92afc7-6b4b-42c3-a4be-ba2ab5f814ce', 'a1e2855f-6161-40b6-8484-8c4820fadf16', 'a21bdb3c-6b80-4d2b-907b-fc6e41786a59',
    'baaa31b0-8023-4f5e-a4bf-fd89235710f5', 'e530bb06-e6a0-4043-9cd9-0a97b67a2f2b', 'e7fe7aad-ba05-4fa2-be49-39a2ec22e8a7', 'eff23c38-9028-4f05-86d7-5ed0e5b67624',
    'f2f7f556-e48d-4675-b221-3dae167424b3', 'fe430aa2-5986-4ed1-9071-e6fd4e3260bd', 'ff43b287-002d-4428-89d1-3da3dd5b2e34', '1073dbfa-4cb3-452e-8c37-97ec030240b4',
    '099053e9-a374-495d-9262-65f717f3ace2', '2439f74f-d636-4d17-bf47-4e47f182c9c6', 'ab9cf60c-0670-4133-a177-32957fa20626', '63093e02-b19a-4923-bf8b-9ee1a4a68dc3',
    'b0f18ac3-4ed2-4c66-aa0d-8e35582346f6', '417800f0-37e0-4b50-9bce-86a35bdf4f48', '4196a93d-02c4-4510-9c3f-26a69a2403bd', '48d320d3-a471-41ad-91d8-40e4c7d0ece9',
    '4eb2cc21-5faf-4e9a-94bb-e6a167058650', '506866c4-4b0b-4ed3-94e9-bfd719e0e410', '52ba866d-99a6-40f1-8bf1-2e4daa7d15e5', '5395c433-9bf8-4e3a-9543-66dcafca01e9',
    '60e4f04a-6f3e-4219-9cc8-6031b6403d7b', '646c1af2-395d-456e-86ef-066d919dd96a', '8c44189b-f620-4abc-aa29-8722743ecae3', '8fe458f0-2915-4f6b-bd7d-a63bb5476156',
    '9f4d6b1d-a1d0-4082-8676-89348a0090be', 'a8481453-9761-42a9-b6dc-b26ec9ef4b66', 'ac6cef76-80db-472a-8a60-cacc852ede26', 'b58e4124-682c-4b86-aa66-e3cb201d2c9b',
    'cdc0dcd4-e1fb-49a3-9c62-0f528b9f7c9a', 'd66c691b-686c-41a8-9e91-edc9a29fc5bd', 'db8096b3-c5f7-45bf-a9b5-cc628c6c5688', 'dcc5f9f6-ec78-4e9a-a36d-66c91bc32271',
    'e4be9118-fabc-4bf2-b6be-918b47f013da', 'e59340ff-f354-466b-901e-fa8cb359a86c', 'f0c15f4a-2408-4f65-a3e7-4896265456e2', '95687742-0718-48a1-b38c-705f0104c87d',
    '954cbea9-b7e6-4758-a3fb-ec6f0ac61db6', 'da619c48-ccc0-4497-b90c-6ecb3b5a2aa9', '60ff5912-d6a8-431f-aab0-b8356b34587b', 'f18b4d08-287f-4b5b-a982-074c05248c47',
    'ea6b75f1-7797-4302-80ea-8f635309f437', 'f623ec10-faa7-43b7-a8b6-bbd4665e31af'
  ]::uuid[]);
  get diagnostics n = row_count;
  if n <> 54 then raise exception '1. 54 in-app test posts: expected 54 rows, got %', n; end if;
end $$;

-- 2. 135 stale duplicate copies
do $$ declare n int; begin
  delete from tasks where origin = 'sheet' and id = any(array[
    '03cc9781-7f26-4b0f-810a-4539ca7b3207', 'cc893a72-eb1d-43c9-b4b3-ab699fc5856d', '5ae49547-d759-4f95-b341-13c32c86ebde', '628fb13f-e113-48f5-93c3-b978fe2286fc',
    '6d1e45e6-9cfe-4aa6-b4cd-ea9c3e0f7b7d', '7e787a6f-1c18-4ce9-a634-b279a5d3e1e6', 'a2dd47ea-8c34-4810-b4eb-1503b0489db4', 'e92d8a9c-f7e9-4185-9d68-bd197391ca17',
    'fed7f5f9-98ca-42ba-a3b7-7dd18feda3b1', 'a285cb50-f98a-4fa8-a14f-4dc2da1ae06d', 'a1bcfa9f-de21-4de9-8241-43a662f10288', 'df4e5957-c629-43ee-a0df-bb7b022decd4',
    '6fac0652-4c98-4f57-8d08-c76522388ed8', 'b07562e2-2729-4e2a-b7ad-aa8f17dfa50a', 'd20b6ac5-986b-4ae6-8870-b4091dc7dbc5', 'e6b38b64-e902-46da-a1db-5445a56ab98f',
    '6fb1b508-90a8-4dae-9a55-de7557fd8881', '2bc6ae49-342a-427f-8c59-4e578c3baf6f', '5c471115-ef3c-4da8-ac5a-c487e4126343', '39687a26-1222-481c-a60a-f102aab85d5f',
    'd131b9bb-5885-4844-bd4e-359b23c13cdd', '1590ec25-6718-4c50-a449-3a33a0a8807f', '14da30bc-82ba-4d46-b90e-3945d9b966cc', '8e853cfe-0f32-444d-9f99-88d641996696',
    'f2ea00fb-c118-4e3d-8cd0-31c7b14a0860', 'ce9c5ff1-9a5a-4e54-af5c-a47113332440', '63fe8e6e-e704-484a-b0dc-e9892ede5a9d', '45e48608-70eb-4be0-8bae-0c1010afad3b',
    '3748fd82-b7f3-46bf-a68b-37d42410274a', 'b12983bb-bf36-4fe1-b8e9-a5124a40923c', '221247f3-24c9-4e94-a6a5-fe88c70eefb5', 'e24ac800-3fea-4a3e-b5ea-61f0641004bf',
    '98e9ce05-3ddd-463e-bf2f-fd7bce3a04ac', '565dd595-95e2-418b-ab34-09cce275e45e', '6756ad21-b468-4062-b34a-5744303d27ea', 'cc44bb9c-8ad6-4c1b-b7a4-1d020731fc50',
    '0390f0a8-5bb8-4725-a4ea-ffb9a954ebf1', 'e550d01f-7ba0-47dd-89fa-797e69f60ca5', '8910c520-7f33-4150-a2b3-461ddc5a2090', '5090e8c9-25ac-4588-b30c-2c9cf11af4ea',
    '35f2d5b1-ff8b-4191-80eb-4fab719c1b7c', '4162836a-e86e-40ff-81c5-24e6e4ce12cb', '00d4c704-2f25-451a-b96b-3d3583ad5ff0', '0cd07616-f38b-4e42-958e-fed2846e9314',
    'edf1660a-bff2-4205-ac31-54383611d211', 'dd44fccd-302c-4495-803a-5761e57e18ce', '6cf6620c-0805-481c-9c04-399f1e474195', 'dfb5212b-fcf4-4d5a-8daa-5c246405edc3',
    '484ec16d-61a8-4ef3-9d34-45d35f9d7848', '99f9257b-0205-486e-8405-2e16769088b9', '14e6fae3-d587-4116-8b57-ba7161cdf9f3', '3ab3faab-0cc3-4d78-b089-f7ea5f9869cf',
    '655c1f29-b710-4207-9126-d537e04a4753', 'e3a0d4a7-c2d5-4ff8-a3d8-26002e60da6e', '8fb39fe5-2bc6-4a69-830e-20c03690e504', '748e9eb4-9c9d-4e8d-b7d3-652505d5e0d9',
    'dc048472-6c84-48b7-866f-510a61f9fe3d', 'c2a0592d-2239-4887-b35f-d5c2eb164d75', '9953f07a-b584-46d8-ac9d-c19932e23061', '907c2527-ec3b-4981-9827-2a59477fbef5',
    '01bb4a04-a2de-43e3-8193-dc3bca7947a1', 'e6504142-22e5-415b-873e-abcdb4e7e30c', 'ef31036e-6092-46e6-b352-89257062cd78', '19e6d856-6108-43fe-b662-1ccb61e04622',
    'e96f3328-8b5f-4e06-9249-f6e234ef1903', '3dc216e9-811e-47f3-b103-16b6f11798e8', '17d24e06-798d-45df-9f64-bb8f157e3c9d', 'b251c610-455e-47fe-904e-a7a4d3279fc0',
    'e7d3c162-30a9-4103-b56f-bcfcfe32da6f', '1ae89340-79da-470e-a66c-71eeef030853', '284d363c-8b4d-498a-8a6f-87207b2af4f4', '020d3916-2630-4009-8333-533108244b31',
    '5f1ca4bb-bf1d-4504-967a-70d936256b59', '7283678e-6c17-4be1-923e-25655cd7922c', '17bf9638-e2d0-4c50-a28f-51fe48eef894', '44d37e87-f211-4167-961e-51a2d9e813a1',
    '891cd7ca-47dd-4f5d-a5d3-31997e0d550e', 'e5f7604e-dd37-4bbd-b844-8c69fad44e88', '07717748-49fa-4757-bc20-dce74c4475f5', '74524bee-20ac-4612-9aeb-c20f62ba6f4a',
    'b86723dc-3287-4908-b6a3-3dce3ed170e3', 'ff2c6c66-ab76-4e8b-a21c-ff2271cde41d', '6e74d96f-880a-4734-8062-440e23dfad9a', '846c200d-c6cc-4dba-b9a5-92d32b913469',
    '7d2f89d9-7ed2-49a9-80d1-890121486023', 'fd1372c5-d5b8-46c8-a080-ca00447a8fd4', '4ee82aa3-4942-4090-a8b1-4b5f42ae9491', 'b4bf6352-3338-48a5-898c-ad4571608025',
    '9640c61e-7b2c-4604-8d72-11c8d1b20841', '68ddbb78-7a3e-46f3-9ee2-ca3a9fac6814', '00efc4f0-1398-462e-9ae7-5328aefd1d4a', '02a867dc-d102-4cfc-aee7-3d5a1639db5b',
    'ad625b0c-f7e3-4660-8b41-474ff9d2e55b', 'ba2040cc-1499-40d6-9eaa-3bfea54ad18e', 'f1e654de-1102-4eb0-bcf2-c6f251865021', '72e4fbb0-af1d-4abd-8b14-9272a451708b',
    '2a767a0d-ae7f-4b3c-837a-5b7515e1bb8d', '70ca994d-60f6-4e34-bb4f-ecfc69c6cd68', '9f67f00a-925e-4c9c-8766-f60f8c349981', 'aa8066c2-d4a9-4515-9396-d266ef3fc5b8',
    '6f56b8d6-4e01-4c8d-9f86-4679a0c9cd74', 'f6d09d04-9ba3-4ed0-b81e-094a9c11666f', '9ccfa165-4f1f-4e26-b624-072c2b360238', '16fbb71d-675a-40fa-b773-b01cfc2eae9e',
    '86412dcb-38e0-43fb-951f-3cc48d0bd0d4', 'd955a67a-2298-46e9-91e0-b19561839591', '4e530f29-e75b-4ca3-b838-6d2ac96b06e3', '32e8d279-4fd6-4dc2-8890-fe1dcfde4282',
    'cc4c32a4-327b-4338-9670-e940595030cc', 'de4758bb-6a14-4acb-9a36-2b449090fcca', '7e48df27-5568-4434-808d-92ec515744ca', '0373269f-e149-4f34-92fb-513eaf03d72f',
    'f85b21bb-f498-4bba-8a3e-46770a26b0b6', 'b93c3890-a882-49be-b540-993456f83ab9', 'b5264d08-178b-41c1-a350-252f6196521e', 'fe2ad9da-f547-4809-825d-5518a9866150',
    '7aed7daf-86d9-43f0-b298-d9bce3a21770', 'd47af05e-708f-4a01-a490-8fb983e76f97', '34ff6f93-93b9-4b11-8377-3d5a1770ff67', '238b5e5c-9267-4e6c-81ba-dfeaaa35848a',
    'fb5c3aee-5c38-40f0-af93-80e639ebe112', '1834c64a-8eb0-4c34-9ce5-f656edfd344f', '14e3eb57-bf54-4d14-a0e9-6165704a31e7', 'fa713570-c646-42a6-8517-a2707fe9ba8f',
    'db1ce442-c2b7-423c-8d75-0755d901e3f0', '37344670-43ee-4659-86b6-3b599cbba766', '5e136d50-7d91-49a0-8644-630fe11c743a', '6dfa75c3-2f91-49ac-960c-b88742037310',
    'b0c65afe-566a-41aa-b11c-7f1e79182012', 'eb83d151-2794-45e8-ba1b-8c7c9ed5a377', '8c8eec62-7672-4b59-a6ec-cc92cc0fe975', 'e850fc35-d6e4-4d59-bc6e-82508f57dc90',
    '76fb2870-176c-4a84-9e63-10407b6e2fb8', 'b263cc9f-10b2-4fdd-9f26-144783436f2d', 'f0810eaf-2398-4a87-9f0e-fec3b0cf3a7a'
  ]::uuid[]);
  get diagnostics n = row_count;
  if n <> 135 then raise exception '2. 135 stale duplicate copies: expected 135 rows, got %', n; end if;
end $$;

-- 3. 25 in-app test events
do $$ declare n int; begin
  delete from events where origin = 'ui' and id = any(array[
    '0234f20d-7072-4e0c-86d0-d0ef2bd4ab0a', '124f20b7-084d-4d28-a02c-de64e30daaa9', '1dd01581-5b9f-40b8-a005-264b0000d202', '4722933c-d4b4-4654-be8b-52b37c7e5f1a',
    '4ac56058-6a41-4b66-bc5b-27a4ed9b55b7', '50734055-550a-4419-8f0e-39d17ccd1d2c', '59d38276-67a2-4d2c-abb6-4d3d21be988c', '6b54c55c-5a05-41d5-abdb-9035c872099c',
    '6fbae18e-6031-4fdd-b2ba-e99b70748743', '7eb9a9bc-67aa-4ab4-883b-bd1128b57c10', '937c5f9a-4f49-4c2a-b0e4-1b9e3e8137fc', '9ddb69dd-87f3-4a5d-83f1-35dcb74bd23a',
    'add83969-566b-4a17-a578-f4bc628ac1ed', 'b27243d3-6f4c-4165-ad65-c401f20b9be3', 'cf5a3108-3f43-4bbb-ac41-3165afc0c4cd', 'da20bfc7-cf1f-4f24-a431-ba2b912275cc',
    'df7e632a-bdca-403b-992e-0a6f61685dca', 'e1fb6d47-b38f-4ad0-9574-1c3936cd6905', 'e362126b-26f8-4c2d-a584-c74d2d4346d5', 'ef20ef7f-97a4-490f-b72f-98fddde9949a',
    'f1d69df2-8976-4bb1-9c09-666a362455f4', 'f503535e-58d0-4483-828d-ab2015095e6e', 'b9568f04-2563-4206-a170-d68b1293e779', '203a6f13-321e-41b3-b6a6-76f201b26b64',
    '56a22767-21c7-4f2f-bde8-45b58c4f8136'
  ]::uuid[]);
  get diagnostics n = row_count;
  if n <> 25 then raise exception '3. 25 in-app test events: expected 25 rows, got %', n; end if;
end $$;

-- 4a. 5 announcements
do $$ declare n int; begin
  delete from announcements where id = any(array[
    '2164e569-98fa-4f2f-8561-fce755f1711a', '95e8c2db-f6f4-4e8d-bb2f-1f747797cd3a', '021f0504-d563-4742-bfb9-b78c12463cdc', '30eec765-98b9-48d6-869d-c92776d5734c',
    '0f3b1bfd-f29e-415f-bf29-34c7e4d549a9'
  ]::uuid[]);
  get diagnostics n = row_count;
  if n <> 5 then raise exception '4a. 5 announcements: expected 5 rows, got %', n; end if;
end $$;

-- 4b. 2 test tickets
do $$ declare n int; begin
  delete from tickets where id = any(array[
    'e7de84e5-8781-4a06-aeb8-81abc6f90611', 'e10a3979-cf57-455a-86ec-23e0d645461b'
  ]::uuid[]);
  get diagnostics n = row_count;
  if n <> 2 then raise exception '4b. 2 test tickets: expected 2 rows, got %', n; end if;
end $$;

-- 4c. test staff Ravi
do $$ declare n int; begin
  delete from boas where id = '08cbf8eb-b1a4-4831-bfd2-8dc7dbe9626e' and email = 'testing@nxtwave.co.in';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '4c. test staff Ravi: expected 1 rows, got %', n; end if;
end $$;

-- 5. 2 test universities
do $$ declare n int; begin
  delete from universities where code in ('testing-university', 'central-testing') and id = any(array[
    'd57a2d01-2f8e-426d-87fd-d7e569fb4ff7', '92586be4-fadc-46cd-9b69-582b675fccee'
  ]::uuid[]);
  get diagnostics n = row_count;
  if n <> 2 then raise exception '5. 2 test universities: expected 2 rows, got %', n; end if;
end $$;

-- 6. S Meena receive reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = '080c39ad-0e65-47f7-9a2e-8e1e4dfda2ab' and university_id = 'eed06f54-4ec6-43da-9382-ceb4aefc3279' and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '6. S Meena receive reminders off: expected 1 rows, got %', n; end if;
end $$;
