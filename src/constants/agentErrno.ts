// HTTP status codes used for friendly error mapping (per S2 §17).
// Backend response.body.code is always 0/1; errno strings only in HTTP status.
export const HTTP_CHILD_ACCOUNT_FORBIDDEN = 403;
export const HTTP_SKILL_NOT_FOUND = 404;
export const HTTP_SKILL_BUILDER_FAILED = 422;

export interface AxiosLikeError {
  response?: { status?: number; data?: { message?: string } };
  message?: string;
}

/** Extract HTTP status from a thrown error (axios native or custom). */
export function errorStatus(e: unknown): number | undefined {
  return (e as AxiosLikeError)?.response?.status;
}

/** Extract a user-friendly message from a thrown error. */
export function errorMessage(e: unknown, fallback = "操作失败"): string {
  const ae = e as AxiosLikeError;
  return ae?.response?.data?.message || ae?.message || fallback;
}
