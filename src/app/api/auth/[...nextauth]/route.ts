import { handlers } from "@/lib/auth/auth";

// Auth.js requires this catch-all handler to service its own endpoints
// (callback, csrf, session, signout). It is not a REST API layer — everything
// else in this app goes through Server Actions. See EXECUTION-PLAN.md §3.
export const { GET, POST } = handlers;
