import { Application } from '../entities/application.entity';

export interface ApplicationApplicantSummary {
  userId: string;
  name: string | null;
  activityName: string;
  profileImgUrl: string;
}

/** GET 지원서 응답 — `user`/`announcement` relation 대신 `applicant` 요약 */
export type ApplicationDetailResponse = Omit<
  Application,
  'user' | 'announcement'
> & {
  applicant: ApplicationApplicantSummary;
};

export function toApplicationApplicantSummary(
  app: Application,
): ApplicationApplicantSummary {
  const user = app.user;
  return {
    userId: user?.userId ?? app.userId,
    name: user?.name ?? app.name ?? null,
    activityName: user?.activityName ?? '',
    profileImgUrl: user?.profileImgUrl ?? '',
  };
}

/** 지원서 API 응답 — 전체 User/Announcement 중첩 대신 applicant 요약만 노출 */
export function toApplicationDetailResponse(
  app: Application,
): ApplicationDetailResponse {
  const plain = { ...app } as Record<string, unknown>;
  delete plain.user;
  delete plain.announcement;
  return {
    ...plain,
    applicant: toApplicationApplicantSummary(app),
  } as ApplicationDetailResponse;
}
