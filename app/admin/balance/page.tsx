import type { Metadata } from "next";

import { BalanceReportPanel } from "@/components/admin/balance-report-panel";
import { RulesetEditor } from "@/components/admin/ruleset-editor";
import { getLatestBalanceReport } from "@/server/balance-report";
import { getRulesetForEdit } from "@/server/ruleset";
import { requireAdmin } from "@/server/session";

/**
 * The balance editor page (Feature 12, US1/T019). A Server Component: re-checks `requireAdmin()`
 * (layer 3 — the layout already redirected non-admins, but never trust an earlier layer), loads the
 * current ruleset **for edit** (with the concurrency version) and the latest fairness report in
 * parallel, and hands them to the client editor + read-only report panel. Always dynamic — it reads
 * the live current ruleset, never a stale prerender.
 */
export const metadata: Metadata = { title: "Balance editor" };
export const dynamic = "force-dynamic";

export default async function BalancePage() {
  const admin = await requireAdmin();
  const [initial, report] = await Promise.all([getRulesetForEdit(admin), getLatestBalanceReport()]);

  return (
    <div className="flex flex-col gap-8">
      <RulesetEditor initial={initial} />
      <BalanceReportPanel report={report} />
    </div>
  );
}
