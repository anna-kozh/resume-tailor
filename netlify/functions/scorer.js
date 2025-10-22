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
    const { resume, jobDescription } = JSON.parse(event.body);

    if (!resume || !jobDescription) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Resume and job description are required' })
      };
    }

    const scorerPrompt = `You are an expert at analyzing job descriptions and resumes for keyword alignment and language matching.

TASK: Analyze how well this resume matches the job description's language and terminology.

Job Description:
${jobDescription}

Resume:
${resume}

Provide your analysis in the following JSON structure (respond with ONLY valid JSON, no markdown):

{
  "overall_score": <number 0-100>,
  "keyword_coverage": {
    "score": <number 0-50>,
    "matched_keywords": [
      "<keyword1>",
      "<keyword2>"
    ],
    "missing_keywords": [
      {
        "keyword": "<keyword>",
        "importance": "critical|high|medium",
        "risk": "low|medium|high",
        "points": <number>
      }
    ]
  },
  "language_alignment": {
    "score": <number 0-50>
  }
}

Focus on extracting 15-20 most important keywords from the ENTIRE job description and checking which appear in the resume.`;

    console.log('Scorer - JD length:', jobDescription.length, 'Resume length:', resume.length);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: scorerPrompt }],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(analysis)
    };
  } catch (error) {
    console.error('Scorer error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Analysis failed', 
        message: error.message 
      })
    };
  }
};