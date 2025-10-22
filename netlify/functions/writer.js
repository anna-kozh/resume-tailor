import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export const handler = async (event) => {
  // Add timeout handling
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Function timeout')), 25000)
  );

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

    // Extract only the missing keywords to add
    const keywordsToAdd = selectedGaps && selectedGaps.length > 0 
      ? selectedGaps.slice(0, 5) // Limit to 5 keywords max
      : analysis?.keyword_coverage?.missing_keywords?.slice(0, 5).map(k => typeof k === 'string' ? k : k.keyword) || [];

    // Shorter, more focused prompt
    const writerPrompt = `Rewrite this resume to naturally incorporate these keywords from the job description: ${keywordsToAdd.join(', ')}

RULES:
- Only modify existing content, don't fabricate
- Add keywords naturally in context
- Keep the same resume structure
- Be concise

JOB DESCRIPTION (for context):
${jobDescription.substring(0, 1000)}

CURRENT RESUME:
${resume}

Return ONLY valid JSON with this structure (no markdown, no code blocks):
{"text":"optimized resume text here","newScore":85,"changes":[{"keyword":"added keyword","location":"where"}]}`;

    // Race between API call and timeout
    const apiCall = openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: writerPrompt }],
      temperature: 0.2,
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    });

    const completion = await Promise.race([apiCall, timeoutPromise]);
    const responseText = completion.choices[0].message.content;
    
    console.log('GPT Response length:', responseText.length);
    
    let optimized;
    try {
      optimized = JSON.parse(responseText);
      console.log('Successfully parsed JSON');
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      console.error('First 200 chars:', responseText.substring(0, 200));
      
      // Return a minimal valid response
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          text: resume + "\n\n[Note: AI optimization encountered formatting issues. Your original resume is shown above. Please try again.]",
          changes: [],
          newScore: (analysis?.overall_score || 60) + 10
        })
      };
    }

    // Validate and fill missing fields
    const response = {
      text: optimized.text || resume,
      changes: Array.isArray(optimized.changes) ? optimized.changes : [],
      newScore: optimized.newScore || (analysis?.overall_score || 60) + 15
    };

    console.log('Returning response with score:', response.newScore);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Writer function error:', error);
    
    // Return a more informative error
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Optimization failed',
        message: error.message || 'Unknown error',
        details: error.toString()
      })
    };
  }
};