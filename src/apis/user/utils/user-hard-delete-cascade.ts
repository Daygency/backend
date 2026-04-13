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

  if (appIds.length > 0) {
    const placeholders = appIds.map(() => '?').join(',');
    const roomIds = [
      ...new Set(
        mapQueryIds(
          await manager.query(
            `SELECT id FROM chat_room WHERE form_id IN (${placeholders})`,
            appIds,
          ),
        ),
      ),
    ];

    if (roomIds.length > 0) {
      const rp = roomIds.map(() => '?').join(',');
      await manager.query(
        `DELETE FROM message WHERE chat_room_id IN (${rp})`,
        roomIds,
      );
      await manager.query(
        `DELETE FROM chat_room_member WHERE chat_room_id IN (${rp})`,
        roomIds,
      );
      await manager.query(`DELETE FROM chat_room WHERE id IN (${rp})`, roomIds);
    }

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
