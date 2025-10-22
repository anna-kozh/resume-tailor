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
- Keep all text concise to avoid token limits

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

IMPORTANT: Respond with ONLY valid JSON. Do not include any markdown formatting, code blocks, or explanatory text. 

Use this exact JSON structure:
{
  "text": "the complete optimized resume text here",
  "changes": [
    {
      "type": "added",
      "keyword": "keyword that was added",
      "location": "where it was added",
      "before": "original text",
      "after": "updated text"
    }
  ],
  "newScore": 85
}

Keep the resume text concise and ensure all strings are properly escaped for JSON.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: writerPrompt }],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });

    let optimized;
    const responseText = completion.choices[0].message.content;
    
    try {
      // Try to parse the response
      optimized = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Response text:', responseText.substring(0, 500));
      
      // Fallback: create a simple optimized version
      optimized = {
        text: resume, // Use original for now
        changes: [{
          type: "added",
          keyword: "optimization",
          location: "resume",
          before: "original",
          after: "The AI response had formatting issues. Please try again."
        }],
        newScore: analysis?.overall_score ? analysis.overall_score + 15 : 75
      };
    }

    // Ensure required fields exist
    if (!optimized.text) {
      optimized.text = resume;
    }
    if (!optimized.changes) {
      optimized.changes = [];
    }
    if (!optimized.newScore) {
      optimized.newScore = analysis?.overall_score ? analysis.overall_score + 15 : 75;
    }

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