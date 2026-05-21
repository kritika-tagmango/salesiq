// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ai-coach-update · Supabase Edge Function
// Runs Claude on unanalysed calls and
// writes coaching insights back to Supabase
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYSTEM_PROMPT = `You are an AI sales coach for Kritika Gupta, Account Executive at TagMango.
You analyse sales call summaries and extract structured coaching data.

Given a call summary, return ONLY valid JSON with this exact structure:
{
  "score": <0-100 integer>,
  "talk_ratio_you": <integer percentage>,
  "talk_ratio_them": <integer percentage>,
  "objections": [
    { "question": "...", "category": "pricing|product|competitor|technical|objection", "rating": "good|partial|missed", "your_answer": "...", "better_answer": "..." }
  ],
  "buying_signals": ["...", "..."],
  "risk_signals": ["...", "..."],
  "next_step": "...",
  "coaching_tip": "One specific, actionable thing to do differently next call"
}

Base scoring on: Q&A quality (40%), talk ratio benchmark 55:45 (20%), next step set (20%), buying signals (20%).
Return ONLY JSON. No markdown, no preamble.`;

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }),
      { status: 500 }
    );
  }

  // Get calls without a score (unanalysed)
  const { data: unanalysed, error } = await supabase
    .from("calls")
    .select("*")
    .is("score", null)
    .not("summary", "is", null)
    .limit(10); // Process 10 at a time

  if (error || !unanalysed?.length) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, message: "No unanalysed calls found" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const processed: string[] = [];
  const errors: string[] = [];

  for (const call of unanalysed) {
    try {
      const prompt = `Analyse this sales call:

Lead: ${call.lead_name} (${call.lead_email})
Date: ${call.call_date}
Type: ${call.call_type}
Summary: ${call.summary}
Duration: ${call.duration_mins} minutes

Provide the JSON coaching analysis.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        errors.push(`${call.id}: Claude API error ${res.status}`);
        continue;
      }

      const data = await res.json();
      const rawText = data.content?.[0]?.text ?? "{}";

      let analysis: any;
      try {
        analysis = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      } catch {
        errors.push(`${call.id}: JSON parse failed`);
        continue;
      }

      // Update call with score + talk ratio + next step
      await supabase
        .from("calls")
        .update({
          score: analysis.score ?? null,
          talk_ratio_you: analysis.talk_ratio_you ?? null,
          talk_ratio_them: analysis.talk_ratio_them ?? null,
          next_step: analysis.next_step ?? null,
          coaching_tip: analysis.coaching_tip ?? null,
        })
        .eq("id", call.id);

      // Insert objections
      if (analysis.objections?.length) {
        const objections = analysis.objections.map((o: any) => ({
          call_id: call.id,
          lead_email: call.lead_email,
          question: o.question,
          your_answer: o.your_answer,
          better_answer: o.better_answer,
          rating: o.rating,
          category: o.category,
        }));
        await supabase.from("objections").insert(objections);
      }

      // Insert follow-up if next step exists
      if (analysis.next_step) {
        await supabase.from("follow_ups").upsert({
          lead_email: call.lead_email,
          action: analysis.next_step,
          urgency: "warm",
          done: false,
          source_call_id: call.id,
        }, { onConflict: "lead_email,action" });
      }

      processed.push(call.id);
    } catch (e: any) {
      errors.push(`${call.id}: ${e.message}`);
    }
  }

  const result = {
    ok: true,
    processed: processed.length,
    errors: errors.length,
    error_details: errors,
    timestamp: new Date().toISOString(),
  };

  console.log("ai-coach-update result:", result);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
