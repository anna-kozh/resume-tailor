// netlify/functions/ats-audit.mjs
// Purpose: Deterministic ATS-style audit + rewrite suggestions. JSON-only output.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'BAD_REQUEST', message: 'Invalid JSON body' }),
    };
  }

  const {
    job_description,
    resume,
    user_locale = 'en-AU',
    max_suggestions = 20,
    model = process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature = 0.2,
    top_p = 0.9,
  } = payload;

  const missing = [];
  if (!job_description) missing.push('job_description');
  if (!resume) missing.push('resume');
  if (missing.length) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'MISSING_INPUT', fields: missing }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_PUBLIC || process.env.OPENAI;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'SERVER_MISCONFIG', message: 'Missing OPENAI_API_KEY' }),
    };
  }

  const systemPrompt = `
You are an ATS-style reviewer and resume editor. Be concise, specific, and deterministic.
Follow these hard rules exactly:

- No invention. Never create experience, titles, companies, dates, or metrics not present in the resume.
- Truth audit first. Every suggested phrase gets one of: ✅ Verifiable, 🟡 Reframed, 🔴 Risky.
- Explain every change with a one-line rationale tied to a JD requirement.
- Zero keyword dumping. Rewrites must read naturally.
- Use Australian English.
- Deterministic tone. No coaching fluff.

Method (fixed):
1) Parse JD → extract exact title, team/domain hints, requirements.
   Classify terms into: Core, Technical, Research & Validation, Domain, Leadership.
   Build synonym sets (e.g., "explainability" ~ "model reasoning").
2) Parse Resume → segment (Summary, Roles, Bullets, Skills, Certs). Extract claims, metrics, AI signals.
3) Match & Score → semantic match allowed via synonyms. Weights:
   Core 3.0, Technical 2.5, Research 2.0, Domain 2.0, Leadership 1.5.
   Output coverage per category and overall coverage_score 0–100.
4) Gap Detection → rank gaps by impact. Only include items plausibly supported by resume or safely reframable.
5) Honesty Audit → mark each proposal as ✅ Verifiable | 🟡 Reframed | 🔴 Risky.
   If 🔴 include a confirmation_question.
6) Rewrite Suggestions → for each gap, output one tight sentence or mini-bullet with:
   target_section, insert_after, rewrite, rationale, maps_to_jd, truth_level, expected_coverage_delta, category.
   Do not use markdown or bold. No tags.
7) Ethics & Safety → bias/privacy/overclaim/explainability flags + mitigation.
8) Explain Like a Reviewer → "how_ats_reads_this" notes, and 3–5 item executive_summary.
9) Telemetry → tokens_used (approx ok), model, temperature, notes.

Guardrails:
- If input missing, return { "error": "MISSING_INPUT", "fields": [...] } only.
- Never alter dates, companies, locations, or titles.
- If a suggestion is 🔴 Risky, include confirmation_question and keep it in suggestions, but caller decides whether to apply.
- Output strict JSON object only (no markdown).

Respond in this JSON schema:

{
  "analysis_title": string,
  "job_title": string,
  "coverage": {
    "overall_score": number,
    "by_category": {
      "core": {"score": number, "hits": string[], "misses": string[]},
      "technical": {"score": number, "hits": string[], "misses": string[]},
      "research_validation": {"score": number, "hits": string[], "misses": string[]},
      "domain": {"score": number, "hits": string[], "misses": string[]},
      "leadership": {"score": number, "hits": string[], "misses": string[]}
    },
    "top_gaps": [
      {"term": string, "category": string, "impact": "high"|"medium"|"low", "jd_quote": string}
    ]
  },
  "truth_audit": [
    {
      "proposed_claim": string,
      "evidence_snippets": [{"resume_section": string, "text": string}],
      "truth_level": "Verifiable" | "Reframed" | "Risky",
      "risk_reason": string,
      "confirmation_question": string
    }
  ],
  "suggestions": [
    {
      "id": string,
      "target_section": "Summary" | "Experience: <Company>" | "Skills" | "Certifications",
      "insert_after": string,
      "rewrite": string,
      "rationale": string,
      "maps_to_jd": string[],
      "truth_level": "Verifiable" | "Reframed" | "Risky",
      "expected_coverage_delta": number,
      "category": "core" | "technical" | "research_validation" | "domain" | "leadership"
    }
  ],
  "ethics_flags": [
    {"type": "bias" | "privacy" | "overclaim" | "explainability", "issue": string, "mitigation": string}
  ],
  "explainers": {
    "how_ats_reads_this": string[],
    "executive_summary": string[]
  },
  "telemetry": {
    "tokens_used": number,
    "model": string,
    "temperature": number,
    "notes": "Deterministic pass"
  }
}
`;

  const userPrompt = JSON.stringify({
    user_locale,
    max_suggestions,
    job_description,
    resume,
  });

  try {
    // OpenAI Chat Completions (Responses) API
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature,
        top_p,
        presence_penalty: 0.0,
        frequency_penalty: 0.0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt.trim() },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'LLM_UPSTREAM_ERROR', status: resp.status, body: text?.slice(0, 500) }),
      };
    }

    const data = await resp.json();

    // Defensive parse: ensure we return valid JSON object
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      // If the model returned a string, wrap it as error
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'NON_JSON_RESPONSE', raw: content?.slice(0, 2000) }),
      };
    }

    // Inject telemetry defaults if missing
    result.telemetry = {
      tokens_used: data?.usage?.total_tokens ?? 0,
      model,
      temperature,
      notes: 'Deterministic pass',
      ...(result.telemetry || {}),
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'SERVER_ERROR', message: err?.message || String(err) }),
    };
  }
}
