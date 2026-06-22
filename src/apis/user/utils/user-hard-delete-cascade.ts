import type { EntityManager } from 'typeorm';

function mapQueryIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const row of raw) {
    if (
      row &&
      typeof row === 'object' &&
      'id' in row &&
      typeof (row as { id: unknown }).id === 'string'
    ) {
      ids.push((row as { id: string }).id);
    }
  }
  return ids;
}

async function deleteChatRoomsByIds(
  manager: EntityManager,
  roomIds: string[],
): Promise<void> {
  if (roomIds.length === 0) return;
  const placeholders = roomIds.map(() => '?').join(',');
  await manager.query(
    `DELETE FROM message WHERE chat_room_id IN (${placeholders})`,
    roomIds,
  );
  await manager.query(
    `DELETE FROM chat_room_member WHERE chat_room_id IN (${placeholders})`,
    roomIds,
  );
  await manager.query(
    `DELETE FROM chat_room WHERE id IN (${placeholders})`,
    roomIds,
  );
}

/**
 * 탈퇴(소프트 삭제)된 사용자 행을 물리 삭제하기 전,
 * FK를 참조하는 자식 행을 순서대로 제거한다.
 */
export async function hardDeleteUserCascade(
  manager: EntityManager,
  userId: string,
): Promise<void> {
  await manager.query(
    `DELETE FROM notice_recipient WHERE notice_id IN (SELECT id FROM notice WHERE user_id = ?)`,
    [userId],
  );
  await manager.query(`DELETE FROM notice_recipient WHERE user_id = ?`, [
    userId,
  ]);
  await manager.query(`DELETE FROM notice WHERE user_id = ?`, [userId]);
  await manager.query(`DELETE FROM user_push_device WHERE user_id = ?`, [
    userId,
  ]);

  const postIds = mapQueryIds(
    await manager.query(
      `SELECT post_id AS id FROM announcement WHERE user_id = ?`,
      [userId],
    ),
  );

  const appIds = [
    ...new Set(
      mapQueryIds(
        await manager.query(
          `SELECT id FROM application WHERE user_id = ? OR post_id IN (SELECT post_id FROM announcement WHERE user_id = ?)`,
          [userId, userId],
        ),
      ),
    ),
  ];

  const chatRoomIds = new Set<string>();

  if (appIds.length > 0) {
    const appPlaceholders = appIds.map(() => '?').join(',');
    for (const id of mapQueryIds(
      await manager.query(
        `SELECT id FROM chat_room WHERE form_id IN (${appPlaceholders})`,
        appIds,
      ),
    )) {
      chatRoomIds.add(id);
    }
  }

  if (postIds.length > 0) {
    const postPlaceholders = postIds.map(() => '?').join(',');
    for (const id of mapQueryIds(
      await manager.query(
        `SELECT id FROM chat_room WHERE post_id IN (${postPlaceholders})`,
        postIds,
      ),
    )) {
      chatRoomIds.add(id);
    }
  }

  await deleteChatRoomsByIds(manager, [...chatRoomIds]);

  if (appIds.length > 0) {
    const placeholders = appIds.map(() => '?').join(',');
    await manager.query(
      `DELETE FROM application WHERE id IN (${placeholders})`,
      appIds,
    );
  }

  await manager.query(`DELETE FROM message WHERE user_id = ?`, [userId]);
  await manager.query(`DELETE FROM chat_room_member WHERE user_id = ?`, [
    userId,
  ]);
  await manager.query(`DELETE FROM comment WHERE user_id = ?`, [userId]);
  await manager.query(`DELETE FROM \`like\` WHERE user_id = ?`, [userId]);
  await manager.query(`DELETE FROM scrap WHERE user_id = ?`, [userId]);
  await manager.query(`DELETE FROM news WHERE user_id = ?`, [userId]);
  await manager.query(`DELETE FROM community WHERE user_id = ?`, [userId]);

  if (postIds.length > 0) {
    const postPlaceholders = postIds.map(() => '?').join(',');
    await manager.query(
      `DELETE FROM review WHERE post_id IN (${postPlaceholders}) OR reviewer_user_id = ? OR reviewee_user_id = ?`,
      [...postIds, userId, userId],
    );
    await manager.query(
      `DELETE FROM application_config WHERE post_id IN (${postPlaceholders})`,
      postIds,
    );
    await manager.query(
      `DELETE FROM announcement_major WHERE post_id IN (${postPlaceholders})`,
      postIds,
    );
  } else {
    await manager.query(
      `DELETE FROM review WHERE reviewer_user_id = ? OR reviewee_user_id = ?`,
      [userId, userId],
    );
  }

  await manager.query(`DELETE FROM announcement WHERE user_id = ?`, [userId]);
  await manager.query(
    `DELETE FROM follow WHERE sender_id = ? OR receiver_id = ?`,
    [userId, userId],
  );
  await manager.query(
    `DELETE FROM block WHERE blocker_id = ? OR blocked_id = ?`,
    [userId, userId],
  );
  await manager.query(
    `DELETE FROM \`report\` WHERE reporter_id = ? OR reported_user_id = ?`,
    [userId, userId],
  );
  await manager.query(`DELETE FROM education WHERE userId = ?`, [userId]);
  await manager.query(`DELETE FROM career WHERE userId = ?`, [userId]);
  await manager.query(`DELETE FROM award WHERE userId = ?`, [userId]);
  await manager.query(`DELETE FROM certificate WHERE userId = ?`, [userId]);

  await manager.query(`DELETE FROM \`user\` WHERE \`userId\` = ?`, [userId]);
}
