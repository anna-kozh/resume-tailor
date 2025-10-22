import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { resume, jobDescription, analysis, selectedGaps } = JSON.parse(event.body);

    if (!resume || !jobDescription) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Resume and job description are required' })
      };
    }

    const gapsToAdd = selectedGaps && selectedGaps.length > 0 
      ? selectedGaps.join(', ') 
      : 'all applicable missing keywords';

    const writerPrompt = `You are an expert resume writer. Your goal: help the candidate naturally incorporate job description language into their existing experience.

CRITICAL RULES:
- NEVER fabricate experience or skills
- ONLY reframe existing work using JD-aligned terminology
- Incorporate missing keywords naturally in context where truthful
- Mirror JD's action verbs and phrasing style
- Maintain authenticity—if something can't be truthfully reframed, skip it

KEYWORD PLACEMENT RULES:
1. Hard skills/tools → Skills section
2. Methodologies → Experience bullets with outcomes
3. Domain expertise → Experience bullets with business context
4. Leadership signals → Experience bullets with scope
5. Prioritize adding keywords to experience bullets with context over generic skills listings

Job Description:
${jobDescription}

Current Resume:
${resume}

Keywords to focus on incorporating (if applicable): ${gapsToAdd}

TASK: Rewrite the resume to:
1. Replace weak action verbs with stronger JD-aligned verbs where accurate
2. Incorporate missing keywords naturally into existing bullets
3. Mirror JD terminology exactly when describing similar work
4. Match seniority level language
5. Preserve truth: Only enhance what's already there

Respond with ONLY valid JSON in this format:
{
  "text": "<the complete optimized resume text>",
  "changes": [
    {
      "type": "added",
      "keyword": "<keyword that was added>",
      "location": "<where it was added>",
      "before": "<original text>",
      "after": "<updated text>"
    }
  ],
  "newScore": <estimated new score 0-100>
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: writerPrompt }],
      temperature: 0.5,
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    });

    const optimized = JSON.parse(completion.choices[0].message.content);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(optimized)
    };
  } catch (error) {
    console.error('Writer error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Optimization failed', 
        message: error.message 
      })
    };
  }
};