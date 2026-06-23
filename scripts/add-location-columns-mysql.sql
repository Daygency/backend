-- 모집공고·음악계소식 장소 좌표 (카카오맵)
-- synchronize: false 환경에서 수동 적용

ALTER TABLE announcement
  ADD COLUMN latitude DECIMAL(10, 7) NULL AFTER address,
  ADD COLUMN longitude DECIMAL(10, 7) NULL AFTER latitude;

ALTER TABLE news
  ADD COLUMN latitude DECIMAL(10, 7) NULL AFTER place,
  ADD COLUMN longitude DECIMAL(10, 7) NULL AFTER latitude;
