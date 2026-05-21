// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sync-granola · Supabase Edge Function
// Processes the Granola meeting map and
// upserts leads + calls into Supabase.
// Called manually or on a schedule.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Full meeting map — update this list when new meetings come in
// Format: granola_id (first 8 chars) → { email, name, date, call_type }
const GRANOLA_MEETINGS: Record<string, any> = {
  "c2148efb": { email: "thesocioxpert@gmail.com",    name: "Chandana Punna",       date: "2026-05-21", call_type: "Discovery" },
  "fd4d0111": { email: "tilokani.neetu@gmail.com",   name: "Neetu Tilokani",        date: "2026-05-20", call_type: "Discovery" },
  "77903b20": { email: "eltonvk01@gmail.com",        name: "Elton",                 date: "2026-05-20", call_type: "Discovery" },
  "5b6d8438": { email: "tirthpatel5844@gmail.com",   name: "Tirth Patel",           date: "2026-05-20", call_type: "Discovery" },
  "e58587a2": { email: "chiragchopra786@gmail.com",  name: "Chirag Chopra",         date: "2026-05-19", call_type: "Follow-up" },
  "cb4ef254": { email: "sapannagpal007@gmail.com",   name: "Sapan Nagpal",          date: "2026-05-19", call_type: "Discovery" },
  "b1a365e4": { email: "eazyenglishathome@gmail.com",name: "Rashid C",              date: "2026-05-19", call_type: "Discovery" },
  "7309a5fd": { email: "saik3488@gmail.com",         name: "Team D",                date: "2026-05-19", call_type: "Discovery" },
  "c8f70e86": { email: "chiragchopra786@gmail.com",  name: "Chirag Chopra",         date: "2026-05-19", call_type: "Discovery" },
  "777d1466": { email: "faizee.whitelabelmedia@gmail.com", name: "Ajeesh Faizee",   date: "2026-05-19", call_type: "Discovery" },
  "c0ec21fa": { email: "akshitadayma20@gmail.com",   name: "Akshita",               date: "2026-05-19", call_type: "Discovery" },
  "2b57e819": { email: "designkaramal@gmail.com",    name: "Vishnu Karamal",        date: "2026-05-19", call_type: "Discovery" },
  "bd3d7f09": { email: "joispaulson@gmail.com",      name: "Paullson Joseph",       date: "2026-05-18", call_type: "Follow-up" },
  "2a2bd6cb": { email: "rizwan.ahmad31900@gmail.com",name: "Rizwan Ahmad",          date: "2026-05-19", call_type: "Discovery" },
  "f81319ec": { email: "designkaramal@gmail.com",    name: "Vishnu Karamal",        date: "2026-05-18", call_type: "Follow-up" },
  "52303098": { email: "info.karcns@gmail.com",      name: "Karthik S",             date: "2026-05-15", call_type: "Discovery" },
  "ca56ec07": { email: "uxuiguide@gmail.com",        name: "Niraj",                 date: "2026-05-15", call_type: "Follow-up" },
  "5f22abda": { email: "niravgajera2018@gmail.com",  name: "Niraj Gajera",          date: "2026-05-12", call_type: "Demo + Pricing", score: 78 },
  "b3a70abb": { email: "smritismart83@gmail.com",    name: "Smriti",                date: "2026-05-12", call_type: "Pricing Follow-up", score: 55 },
  "646eb640": { email: "bhartigoel2015@gmail.com",   name: "Bharti Goel",           date: "2026-05-12", call_type: "Demo", score: 70 },
  "17d7376c": { email: "kapilkools@gmail.com",       name: "Kapil Kulshreshtha",    date: "2026-05-12", call_type: "Demo", score: 74 },
  "7ae8f532": { email: "holisticwellnessapproach4u@gmail.com", name: "Nilesh T",   date: "2026-05-12", call_type: "Discovery" },
  "96eb7640": { email: "skillstsb@gmail.com",        name: "TSB Skills",            date: "2026-05-11", call_type: "Discovery" },
  "b0bec917": { email: "sushaaant0412@gmail.com",    name: "Sushant Deshpande",     date: "2026-05-08", call_type: "Demo" },
  "859f92eb": { email: "jananijaanu922@gmail.com",   name: "Janani",                date: "2026-05-08", call_type: "Demo" },
  "88f4e13a": { email: "sarang.bezalwar@gmail.com",  name: "Sarang Bezalwar",       date: "2026-05-08", call_type: "Full Demo", score: 72 },
  "f6abfa40": { email: "prakash.inet@gmail.com",     name: "Prakash Kumar",         date: "2026-05-07", call_type: "Technical Q&A", score: 65 },
  "76dc9277": { email: "drsumali1506@gmail.com",     name: "Dr Sumali Bansal",      date: "2026-05-07", call_type: "Discovery" },
  "326628d9": { email: "khushsmile@gmail.com",       name: "Khushi",                date: "2026-05-07", call_type: "Discovery" },
  "654c3a6f": { email: "prabhav.mistry@kalorex.org", name: "Prabhav Mistry",       date: "2026-05-07", call_type: "Discovery" },
  "f593fe27": { email: "subashinisrinivasan80@gmail.com", name: "Subashini",        date: "2026-05-07", call_type: "Discovery" },
  "a0878ac7": { email: "skaul@consultwlc.com",       name: "Sandeep Kaul",          date: "2026-05-05", call_type: "Pricing + Close", score: 90 },
  "774c241a": { email: "dewangunjan6012@gmail.com",  name: "Gunjan Dewan",          date: "2026-05-05", call_type: "Discovery" },
  "d7879c19": { email: "artzncolours@gmail.com",     name: "Renu",                  date: "2026-05-05", call_type: "Discovery" },
  "3213b886": { email: "priyanka0057@gmail.com",     name: "Priyanka Singh",        date: "2026-05-05", call_type: "Follow-up" },
  "b77acea0": { email: "yogendracacs@gmail.com",     name: "Yogendra",              date: "2026-05-04", call_type: "Discovery" },
  "3dab5168": { email: "prakash.inet@gmail.com",     name: "Prakash Kumar",         date: "2026-05-04", call_type: "Discovery" },
  "a83a49ad": { email: "mevinita05@gmail.com",       name: "Vinita Pathak",         date: "2026-05-04", call_type: "Discovery" },
  "35085c65": { email: "amisdanceacademy@gmail.com", name: "Amisha Jhawar",         date: "2026-05-04", call_type: "Discovery" },
  "59759e10": { email: "wecanbs@gmail.com",          name: "Jithuu",                date: "2026-04-30", call_type: "Negotiation + Close", score: 92 },
  "56f93751": { email: "johnpradeepjl@gmail.com",    name: "John Pradeep",          date: "2026-04-29", call_type: "Negotiation + Close", score: 89 },
  "ec43935c": { email: "shaarahnaved@gmail.com",     name: "Shaarah",               date: "2026-04-28", call_type: "Discovery" },
  "b63ab756": { email: "somamail.mondal2010@gmail.com", name: "Soma",               date: "2026-04-28", call_type: "Discovery" },
  "b1db913b": { email: "ravindra.kulkarni@bkfbliss.org", name: "Ravindra Kulkarni", date: "2026-04-28", call_type: "Discovery" },
  "f659829f": { email: "pawanjadhav9100@gmail.com",  name: "Pawan Jadhav",          date: "2026-04-27", call_type: "Discovery" },
  "55ad0b7b": { email: "sital.tripathy23@gmail.com", name: "Sital Tripathy",        date: "2026-04-24", call_type: "Pricing + Close", score: 88 },
  "7c9ccdf0": { email: "llit.p121@gmail.com",        name: "Lalit Parihar",         date: "2026-04-22", call_type: "Discovery" },
  "7abea950": { email: "rkbende@gmail.com",          name: "Ram",                   date: "2026-04-22", call_type: "Discovery" },
  "4b738a88": { email: "hussainmsc123@gmail.com",    name: "Shaik Hussain",         date: "2026-04-22", call_type: "Discovery" },
};

const INTERNAL_DOMAINS = ["tagmango.com"];
const isInternal = (email: string) =>
  INTERNAL_DOMAINS.some((d) => email?.endsWith("@" + d));

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const clientMeetings = Object.entries(GRANOLA_MEETINGS).filter(
    ([_, m]) => !isInternal(m.email)
  );

  // 1. Build unique leads
  const leadsMap: Record<string, any> = {};
  for (const [_, m] of clientMeetings) {
    if (!leadsMap[m.email]) {
      leadsMap[m.email] = {
        name: m.name,
        email: m.email,
        source: "Granola",
        stage: "New",
        date_created: m.date,
        last_contact: m.date,
      };
    } else {
      // Keep most recent contact date
      if (m.date > leadsMap[m.email].last_contact) {
        leadsMap[m.email].last_contact = m.date;
      }
    }
  }

  const { error: leadsErr } = await supabase
    .from("leads")
    .upsert(Object.values(leadsMap), { onConflict: "email" });

  if (leadsErr) console.error("Leads upsert error:", leadsErr);

  // 2. Build calls records
  const calls = clientMeetings.map(([granola_id, m]) => ({
    lead_email: m.email,
    lead_name: m.name,
    call_date: `${m.date}T10:00:00+05:30`,
    duration_mins: 30,
    call_type: m.call_type ?? "Discovery",
    score: m.score ?? null,
    granola_id: granola_id,
  }));

  // Only insert calls not already in DB (by granola_id)
  const { data: existing } = await supabase
    .from("calls")
    .select("granola_id")
    .not("granola_id", "is", null);

  const existingIds = new Set((existing ?? []).map((r: any) => r.granola_id));
  const newCalls = calls.filter((c) => !existingIds.has(c.granola_id));

  if (newCalls.length > 0) {
    const { error: callsErr } = await supabase.from("calls").insert(newCalls);
    if (callsErr) console.error("Calls insert error:", callsErr);
  }

  const result = {
    ok: true,
    total_meetings: clientMeetings.length,
    leads_upserted: Object.keys(leadsMap).length,
    new_calls_inserted: newCalls.length,
    timestamp: new Date().toISOString(),
  };

  console.log("sync-granola result:", result);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
