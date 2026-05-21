// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// get-dashboard-stats · Supabase Edge Function
// Returns all KPIs for the Overview tab
// in one fast aggregated query
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // CORS for salesiq.info
  const origin = req.headers.get("origin") ?? "";
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin.includes("salesiq.info")
      ? origin
      : "https://salesiq.info",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenDaysAgo  = new Date(Date.now() - 7  * 86400000).toISOString();
  const today = new Date().toISOString().split("T")[0];

  const [
    { data: leads },
    { data: allCalls },
    { data: followUps },
    { data: todayCals },
    { data: objections },
  ] = await Promise.all([
    supabase.from("leads").select("id, stage, source, created_at"),
    supabase.from("calls").select("id, score, talk_ratio_you, call_date, lead_email").gte("call_date", thirtyDaysAgo),
    supabase.from("follow_ups").select("id, done, urgency"),
    supabase.from("calendly_events").select("id, call_date, lead_name, lead_email, timeline, sells_courses, join_url").gte("call_date", today).lte("call_date", today + "T23:59:59"),
    supabase.from("objections").select("id, category, rating").gte("created_at", thirtyDaysAgo),
  ]);

  const closed     = (leads ?? []).filter((l) => l.stage === "Closed").length;
  const active     = (leads ?? []).filter((l) => !["Closed","Lost"].includes(l.stage)).length;
  const calls30d   = allCalls ?? [];
  const calls7d    = calls30d.filter((c) => c.call_date >= sevenDaysAgo);
  const avgScore   = calls30d.length ? Math.round(calls30d.reduce((a, c) => a + (c.score ?? 0), 0) / calls30d.length) : 0;
  const avgTalk    = calls30d.length ? Math.round(calls30d.reduce((a, c) => a + (c.talk_ratio_you ?? 59), 0) / calls30d.length) : 59;
  const openFUs    = (followUps ?? []).filter((f) => !f.done).length;
  const hotFUs     = (followUps ?? []).filter((f) => !f.done && f.urgency === "hot").length;
  const missed     = (objections ?? []).filter((o) => o.rating === "missed").length;

  // Source breakdown
  const sources: Record<string, number> = {};
  (leads ?? []).forEach((l) => {
    sources[l.source ?? "Unknown"] = (sources[l.source ?? "Unknown"] ?? 0) + 1;
  });

  const stats = {
    // Overview KPIs
    total_leads:       (leads ?? []).length,
    active_leads:      active,
    closed_deals:      closed,
    calls_this_month:  calls30d.length,
    calls_this_week:   calls7d.length,
    avg_call_score:    avgScore,
    avg_talk_ratio:    avgTalk,
    open_follow_ups:   openFUs,
    hot_follow_ups:    hotFUs,
    missed_questions:  missed,
    // Today
    todays_calls:      (todayCals ?? []).length,
    todays_events:     todayCals ?? [],
    // Lead sources
    lead_sources:      sources,
    // Computed
    conversion_rate:   (leads ?? []).length > 0
      ? Math.round((closed / (leads ?? []).length) * 100)
      : 0,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(stats), { headers });
});
