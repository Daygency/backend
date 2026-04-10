-- Optional: 유니크를 예전에 제거한 DB만, 데이터 정리 후 실행.
-- (post_id, user_id) 쌍이 중복이면 ADD UNIQUE 가 실패한다 — 먼저 중복 행을 정리할 것.
--
-- CREATE INDEX `IDX_application_post_user` ... 가 FK 전용으로만 남아 있어도,
-- 유니크 추가 후에는 유니크 인덱스가 (post_id, user_id) 조회에 쓰인다.
-- 비유니크 `IDX_application_post_user` 가 따로 있으면 중복 인덱스이므로 드롭해도 된다.

ALTER TABLE `application`
  ADD UNIQUE KEY `UQ_application_post_applicant` (`post_id`, `user_id`);
