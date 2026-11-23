import type { ApiRequest, ApiResponse } from "../../_lib/apiHandlers.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const { handleSmtpTest } = await import("../../_lib/apiHandlers.js");
    return await handleSmtpTest(req, res);
  } catch (err: any) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: err?.message || "Serverfel i /api/admin/smtp/test" }));
    }
  }
}
