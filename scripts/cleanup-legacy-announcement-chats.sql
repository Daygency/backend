-- 레거시 공고-지원자 1:1 채팅(kind='ANNOUNCEMENT') 완전 삭제.
-- "문의하기"/지원 채팅이 공고당 그룹채팅(GROUP)으로 통합되면서 더는 쓰이지 않는다.
--
-- 운영 DB에 실행하기 전에 반드시 백업을 뜨고, 정말 삭제해도 되는 데이터인지 다시 확인할 것.
-- 순서 중요: message -> chat_room_member -> chat_room (FK 참조 방향의 역순).

DELETE m FROM `message` m
  INNER JOIN `chat_room` r ON r.id = m.chat_room_id
  WHERE r.kind = 'ANNOUNCEMENT';

DELETE cm FROM `chat_room_member` cm
  INNER JOIN `chat_room` r ON r.id = cm.chat_room_id
  WHERE r.kind = 'ANNOUNCEMENT';

DELETE FROM `chat_room` WHERE kind = 'ANNOUNCEMENT';

-- 위 3개 DELETE로 정리가 끝나면, 코드에서 ChatRoomKind.ANNOUNCEMENT 관련 분기
-- (backend/src/apis/chat/entities/chat-room.entity.ts, chat.service.ts, report.service.ts)를
-- 제거하고 enum을 COFFEE | GROUP 두 값으로 정리한다.
