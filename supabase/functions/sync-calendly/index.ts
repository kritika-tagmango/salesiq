// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sync-calendly · Supabase Edge Function
// Fetches Calendly events + invitees
// and upserts into calendly_events + leads
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CALENDLY_USER_URI =
  "https://api.calendly.com/users/c1a44c6a-adc2-48fd-8a97-223d8c2deae1";

const INTERNAL_DOMAINS = ["tagmango.com"];
const isInternal = (email: string) =>
  INTERNAL_DOMAINS.some((d) => email?.endsWith("@" + d));

Deno.serve(async (req) => {
  // Allow manual trigger via POST or scheduled cron
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const CALENDLY_TOKEN = Deno.env.get("CALENDLY_TOKEN");
  if (!CALENDLY_TOKEN) {
    return new Response(
      JSON.stringify({ error: "CALENDLY_TOKEN not set in secrets" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const url =
    `https://api.calendly.com/scheduled_events` +
    `?count=100&min_start_time=${since}&status=active` +
    `&user=${encodeURIComponent(CALENDLY_USER_URI)}&sort=start_time:desc`;

  // 1. Fetch events
  const eventsRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CALENDLY_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!eventsRes.ok) {
    const err = await eventsRes.text();
    return new Response(
      JSON.stringify({ error: "Calendly fetch failed", detail: err }),
      { status: 502 }
    );
  }

  const { collection: events } = await eventsRes.json();
  const synced: string[] = [];
  const leads: Record<string, object> = {};

  // 2. For each event, fetch invitee
  for (const ev of events) {
    try {
      const invRes = await fetch(`${ev.uri}/invitees?count=1`, {
        headers: { Authorization: `Bearer ${CALENDLY_TOKEN}` },
      });
      if (!invRes.ok) continue;

      const { collection: invitees } = await invRes.json();
      const inv = invitees?.[0];
      if (!inv || isInternal(inv.email)) continue;

      const qa = inv.questions_and_answers ?? [];
      const get = (keyword: string) =>
        qa.find((q: any) =>
          q.question.toLowerCase().includes(keyword.toLowerCase())
        )?.answer ?? null;

      const calendlyId = ev.uri.split("/").pop();
      const record = {
        calendly_id: calendlyId,
        lead_name: inv.name,
        lead_email: inv.email,
        call_date: ev.start_time,
        call_end: ev.end_time,
        join_url: ev.location?.actual_instance?.join_url ?? null,
        call_type: ev.name,
        whatsapp: get("WhatsApp"),
        social: get("Social"),
        source: get("know about"),
        sells_courses: get("sell courses"),
        other_platforms: get("other platform"),
        community_size: get("strength"),
        timeline: get("timeline"),
        status:
          new Date(ev.end_time) < new Date() ? "completed" : "scheduled",
      };

      // Upsert event
      await supabase
        .from("calendly_events")
        .upsert(record, { onConflict: "calendly_id" });

      synced.push(calendlyId);

      // Collect lead
      if (!leads[inv.email]) {
        leads[inv.email] = {
          name: inv.name,
          email: inv.email,
          source: record.source ?? "Calendly",
          stage: "New",
          last_contact: ev.start_time,
          date_created: ev.start_time,
        };
      }
    } catch (e) {
      console.error("Event error:", e);
    }
  }

  // 3. Bulk upsert leads
  if (Object.values(leads).length > 0) {
    await supabase
      .from("leads")
      .upsert(Object.values(leads), { onConflict: "email" });
  }

  const result = {
    ok: true,
    synced_events: synced.length,
    synced_leads: Object.keys(leads).length,
    timestamp: new Date().toISOString(),
  };

  console.log("sync-calendly result:", result);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
