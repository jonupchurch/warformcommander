import { handlers } from "@/auth";

export const { GET, POST } = handlers;

// The Drizzle adapter + database sessions need Node (not edge).
export const runtime = "nodejs";
