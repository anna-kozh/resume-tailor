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

For each missing keyword, you MUST provide:
1. A confidence score (0.4 to 1.0) based on these exact rules:
   - High Confidence (0.9-1.0): Explicit match with measurable proof. Exact keyword/phrase from JD, mentioned multiple times, or supported by metrics/tools/projects. Core/critical skill in JD.
   - Medium Confidence (0.7-0.89): Strong but indirect connection. Synonym or close semantic match, mentioned once or lightly supported. Secondary skill.
   - Low Confidence (0.4-0.69): Weak/inferred link. Related but not explicit, implied from project scope or domain. Nice-to-have skill.

2. 2-3 bullet points explaining WHY this keyword was suggested (reasoning)

3. ONE direct quote from the Job Description (max 200 characters) that mentions this keyword or related concept

Provide your analysis in the following JSON structure (respond with ONLY valid JSON, no markdown):

{
  "overall_score": <number 0-100>,
  "keyword_coverage": {
    "score": <number 0-50>,
    "matched_keywords": [
      "<exact phrase from JD that appears in resume>",
      "<another exact phrase>"
    ],
    "missing_keywords": [
      {
        "keyword": "<exact phrase from JD>",
        "importance": "critical|high|medium",
        "confidence": <number 0.4-1.0>,
        "reasoning": [
          "First reason why this was suggested",
          "Second reason with specific context",
          "Third reason if applicable"
        ],
        "jd_quote": "Exact sentence from job description mentioning this keyword (max 200 chars)"
      }
    ]
  },
  "language_alignment": {
    "score": <number 0-50>
  }
}

Rules for keyword extraction:
1. Extract 15-20 total keywords/phrases from the JD
2. Prefer multi-word phrases over single words (e.g., "AI-driven insights" not just "AI")
3. Extract exact phrases as they appear in the JD
4. Focus on: required skills, specific methodologies, tools, domain expertise, and key responsibilities
5. Be consistent - extract the same keywords every time for the same JD
6. ALWAYS include confidence (0.4-1.0), reasoning (2-3 bullets), and jd_quote (max 200 chars) for EVERY missing keyword

Focus on extracting keywords from the ENTIRE job description consistently.`;

    console.log('Scorer - JD length:', jobDescription.length, 'Resume length:', resume.length);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: scorerPrompt }],
      temperature: 0.1,  // Low temperature for consistency
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    // Validate and ensure all missing keywords have required fields
    if (analysis.keyword_coverage?.missing_keywords) {
      analysis.keyword_coverage.missing_keywords = analysis.keyword_coverage.missing_keywords.map(keyword => {
        const keywordText = typeof keyword === 'string' ? keyword : keyword.keyword;
        
        // Ensure confidence is in valid range
        let confidence = keyword.confidence || 0.7;
        if (confidence < 0.4) confidence = 0.4;
        if (confidence > 1.0) confidence = 1.0;

        // Ensure reasoning exists
        const reasoning = keyword.reasoning || [
          "Keyword appears in job description",
          "Related to required qualifications"
        ];

        // Ensure jd_quote exists (truncate to 200 chars if needed)
        let jdQuote = keyword.jd_quote || "Related to job requirements";
        if (jdQuote.length > 200) {
          jdQuote = jdQuote.substring(0, 197) + "...";
        }

        return {
          keyword: keywordText,
          importance: keyword.importance || 'medium',
          confidence: confidence,
          reasoning: reasoning,
          jd_quote: jdQuote
        };
      });
    }

    // Recalculate overall score based on keywords only
    const totalKeywords = (analysis.keyword_coverage?.matched_keywords?.length || 0) + 
                         (analysis.keyword_coverage?.missing_keywords?.length || 0);
    const matchedKeywords = analysis.keyword_coverage?.matched_keywords?.length || 0;
    
    if (totalKeywords > 0) {
      analysis.overall_score = Math.round((matchedKeywords / totalKeywords) * 100);
      analysis.keyword_coverage.score = analysis.overall_score;
      analysis.keyword_coverage.max_score = 100;
    }

    console.log('Analysis complete. Score:', analysis.overall_score);
    console.log('Keywords:', matchedKeywords, '/', totalKeywords);
    console.log('Missing keywords:', analysis.keyword_coverage?.missing_keywords?.length || 0);

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
