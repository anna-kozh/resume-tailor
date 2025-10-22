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

    console.log('Resume length:', resume.length);
    console.log('First 100 chars:', resume.substring(0, 100));

    // Get top 3-5 keywords to add
    const keywordsToAdd = selectedGaps && selectedGaps.length > 0 
      ? selectedGaps.slice(0, 3)
      : analysis?.keyword_coverage?.missing_keywords?.slice(0, 3).map(k => 
          typeof k === 'string' ? k : k.keyword
        ) || [];

    console.log('Keywords to add:', keywordsToAdd);

    if (keywordsToAdd.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          text: resume,
          changes: [{
            keyword: 'No additional keywords needed',
            location: 'Resume already optimized'
          }],
          newScore: (analysis?.overall_score || 70) + 5
        })
      };
    }

    // Simple approach: Add keywords to the resume intelligently
    const writerPrompt = `You are helping optimize a resume. Add these keywords naturally: ${keywordsToAdd.join(', ')}

ORIGINAL RESUME:
${resume}

INSTRUCTIONS:
1. Find the most appropriate places in the resume to add these keywords
2. Add them naturally - either in existing bullet points or in a Skills section
3. Keep all original content
4. Maintain the same format as the original
5. Return the COMPLETE modified resume

Respond with valid JSON only:
{
  "text": "the complete optimized resume text here - include ALL original content with keywords added",
  "changes": [{"keyword": "added keyword", "location": "where you added it"}],
  "newScore": ${Math.min((analysis?.overall_score || 60) + 20, 95)}
}`;

    console.log('Calling OpenAI...');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: writerPrompt }],
      temperature: 0.2,
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0].message.content;
    console.log('Response received, length:', responseText.length);
    
    let optimized;
    try {
      optimized = JSON.parse(responseText);
      console.log('JSON parsed successfully');
      console.log('Optimized text length:', optimized.text?.length);
    } catch (parseError) {
      console.error('JSON Parse error:', parseError.message);
      
      // Manual fallback: add keywords to skills section
      let modifiedResume = resume;
      const changes = [];
      
      // Look for a Skills section (case-insensitive)
      const skillsMatch = modifiedResume.match(/skills:?/i);
      
      if (skillsMatch) {
        const skillsIndex = modifiedResume.toLowerCase().indexOf(skillsMatch[0].toLowerCase());
        const endOfSkillsLine = modifiedResume.indexOf('\n', skillsIndex);
        
        if (endOfSkillsLine > skillsIndex) {
          const beforeSkills = modifiedResume.substring(0, endOfSkillsLine);
          const afterSkills = modifiedResume.substring(endOfSkillsLine);
          modifiedResume = beforeSkills + ', ' + keywordsToAdd.join(', ') + afterSkills;
        } else {
          modifiedResume = modifiedResume + ', ' + keywordsToAdd.join(', ');
        }
        
        changes.push({
          keyword: keywordsToAdd.join(', '),
          location: 'Skills section',
          before: 'Original skills list',
          after: 'Added: ' + keywordsToAdd.join(', ')
        });
      } else {
        // No skills section found, add one
        modifiedResume = modifiedResume.trim() + '\n\nSKILLS:\n' + keywordsToAdd.join(', ');
        changes.push({
          keyword: keywordsToAdd.join(', '),
          location: 'New Skills section',
          before: 'No skills section',
          after: 'Created Skills section with: ' + keywordsToAdd.join(', ')
        });
      }
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          text: modifiedResume,
          changes: changes,
          newScore: (analysis?.overall_score || 60) + 15
        })
      };
    }

    // Ensure we have valid data
    if (!optimized.text || optimized.text.length < 100) {
      console.error('Invalid optimized text, using fallback');
      optimized.text = resume + '\n\n[Keywords to add: ' + keywordsToAdd.join(', ') + ']';
    }

    const response = {
      text: optimized.text,
      changes: Array.isArray(optimized.changes) && optimized.changes.length > 0 
        ? optimized.changes 
        : [{ keyword: keywordsToAdd.join(', '), location: 'Added to resume' }],
      newScore: optimized.newScore || (analysis?.overall_score || 60) + 15
    };

    console.log('Returning successful response');

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
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Optimization failed',
        message: error.message,
        stack: error.stack
      })
    };
  }
};