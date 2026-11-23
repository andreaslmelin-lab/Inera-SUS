import { handlePasswordReset, sendJson, type ApiRequest, type ApiResponse } from "../../server/apiHandlers.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    return await handlePasswordReset(req, res);
  } catch (err: any) {
    return sendJson(res, 500, { error: err?.message || "Serverfel i /api/auth/password-reset" });
  }
}
