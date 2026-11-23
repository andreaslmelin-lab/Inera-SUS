import { handleSmtpTest, sendJson, type ApiRequest, type ApiResponse } from "../../../server/apiHandlers.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    return await handleSmtpTest(req, res);
  } catch (err: any) {
    return sendJson(res, 500, { error: err?.message || "Serverfel i /api/admin/smtp/test" });
  }
}
