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

CRITICAL: Be consistent in your keyword extraction. Extract the most specific, multi-word phrases rather than single words when possible. Focus on exact phrases from the JD.

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
        "risk": "placeholder",
        "points": 0
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

Focus on extracting keywords from the ENTIRE job description consistently.`;

    console.log('Scorer - JD length:', jobDescription.length, 'Resume length:', resume.length);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: scorerPrompt }],
      temperature: 0.1,  // Much lower temperature for consistency
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    // Apply rule-based risk calculation to missing keywords
    if (analysis.keyword_coverage?.missing_keywords) {
      analysis.keyword_coverage.missing_keywords = analysis.keyword_coverage.missing_keywords.map(keyword => {
        const keywordText = typeof keyword === 'string' ? keyword : keyword.keyword;
        const lowerKeyword = keywordText.toLowerCase();
        
        // Determine risk level based on keyword patterns
        let risk = 'medium'; // default
        let points = 3; // default
        
        // HIGH RISK - Only add if you truly have this experience
        if (
          // Job titles and seniority levels
          /\b(principal|lead|director|head of|vp|chief|senior|sr\.)\b/i.test(lowerKeyword) ||
          // Specific role titles
          /\b(system lead|team lead|design lead)\b/i.test(lowerKeyword) ||
          // Years of experience claims
          /\b\d+\+?\s*(years?|yrs?)\b/i.test(lowerKeyword) ||
          // Specific domain expertise that requires deep experience
          /\b(domain expert|subject matter expert|specialist in)\b/i.test(lowerKeyword) ||
          // Specific industry credentials
          /\b(certified|certification|accredited)\b/i.test(lowerKeyword)
        ) {
          risk = 'high';
          points = 5;
        }
        // LOW RISK - Easy to add if you have basic familiarity
        else if (
          // Common tools
          /\b(figma|sketch|adobe|photoshop|illustrator|xd|invision|miro|notion)\b/i.test(lowerKeyword) ||
          // Basic design practices
          /\b(prototyping|wireframing|user research|usability testing|a\/b testing)\b/i.test(lowerKeyword) ||
          // Soft skills
          /\b(collaboration|communication|teamwork|agile|scrum)\b/i.test(lowerKeyword) ||
          // General design concepts
          /\b(user-centered|human-centered|design thinking|user experience|ux|ui)\b/i.test(lowerKeyword) ||
          // Common methodologies
          /\b(iterative|responsive|mobile-first|accessibility)\b/i.test(lowerKeyword) ||
          // Business types (if you've worked in that space)
          /\b(b2b|b2c|saas|marketplace)\b/i.test(lowerKeyword)
        ) {
          risk = 'low';
          points = 2;
        }
        // MEDIUM RISK - Specific methodologies/approaches (default)
        else {
          risk = 'medium';
          points = 3;
        }
        
        // Return normalized keyword object
        return {
          keyword: keywordText,
          importance: keyword.importance || 'medium',
          risk: risk,
          points: points
        };
      });
    }

    console.log('Analysis complete. Score:', analysis.overall_score);
    console.log('Missing keywords with risk:', analysis.keyword_coverage?.missing_keywords?.length || 0);

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