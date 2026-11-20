import { handleAdmin } from "./admin";
import { validateEnv } from "./env";
import type { Env } from "./env";
import { handleWebhook } from "./webhook";

let reported = false;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const check = validateEnv(env);
    if (!check.ok) {
      // Qiymatlar emas, faqat qoida buzilgani haqida; bir izolyatda bir marta log.
      if (!reported) {
        reported = true;
        console.error("env noto'g'ri: " + check.errors.join("; "));
      }
      return new Response("misconfigured", { status: 503 });
    }
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/wh\/([A-Za-z0-9_-]{1,32})$/);
    if (req.method === "POST" && m) return handleWebhook(req, env, m[1]);
    if (url.pathname.startsWith("/admin/")) return handleAdmin(req, env);
    if (url.pathname === "/health") return new Response("ok");
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
