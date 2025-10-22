import React, { useState } from 'react';
import { Upload, Sparkles, Download, AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';

const App = () => {
  const [currentView, setCurrentView] = useState('input');
  const [resume, setResume] = useState({ text: '', filename: '' });
  const [resumeInput, setResumeInput] = useState('');
  const [editableResume, setEditableResume] = useState('');
  const [inputMethod, setInputMethod] = useState('paste');
  const [jobDescription, setJobDescription] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentGapIndex, setCurrentGapIndex] = useState(0);
  const [addedKeywords, setAddedKeywords] = useState([]);
  const [userHasExperience, setUserHasExperience] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [extractedRoles, setExtractedRoles] = useState([]);
  const [impactOptions, setImpactOptions] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    
    if (file.size > 5 * 1024 * 1024) {
      setError('File is too large. Maximum size is 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      let text = event.target.result;
      
      if (text.startsWith('{\\rtf') || text.includes('\\rtf1')) {
        setError('❌ RTF format detected. Please copy and paste your resume text instead.');
        setInputMethod('paste');
        return;
      }
      
      text = text.trim();
      if (text.length < 100) {
        setError('Resume is too short. Please provide a complete resume.');
        return;
      }
      
      setResume({ text, filename: file.name });
      setResumeInput(text);
    };

    reader.onerror = () => {
      setError('Failed to read file. Please try pasting your resume text instead.');
      setInputMethod('paste');
    };

    reader.readAsText(file, 'UTF-8');
  };

  const handleResumeTextChange = (e) => {
    const text = e.target.value;
    setResumeInput(text);
    setResume({ text, filename: 'pasted-resume.txt' });
    if (error) setError('');
  };

  const handleContentEditableChange = (e) => {
    const text = e.target.innerText;
    setEditableResume(text);
  };

  const analyzeResume = async (e) => {
    if (e) e.preventDefault();
    
    if (!resume.text || jobDescription.length < 200) {
      setError('Please upload a resume and paste a job description (minimum 200 characters)');
      return;
    }

    setError('');
    setCurrentView('analyzing');
    setLoading(true);

    try {
      const response = await fetch('/.netlify/functions/scorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: resume.text,
          jobDescription: jobDescription
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data);
      setEditableResume(resume.text);
      setCurrentGapIndex(0);
      setAddedKeywords([]);
      setCurrentView('results');
      
      extractJobRoles(resume.text);
      setUserHasExperience(null);
      setSelectedRole('');
      setImpactOptions(null);
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Analysis failed. Please try again. Error: ' + err.message);
      setCurrentView('input');
    } finally {
      setLoading(false);
    }
  };

  const extractJobRoles = (resumeText) => {
    const lines = resumeText.split('\n');
    const roles = [];
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      if (
        trimmed.match(/designer|lead|senior|consultant|developer|engineer|manager|director/i) &&
        trimmed.length < 100 &&
        !trimmed.startsWith('•') &&
        !trimmed.startsWith('-')
      ) {
        roles.push({
          title: trimmed,
          lineIndex: index
        });
      }
    });
    
    setExtractedRoles(roles);
  };

  const handleExperienceResponse = (hasExperience) => {
    setUserHasExperience(hasExperience);
    
    if (!hasExperience) {
      generateLowImpactOptions();
    }
  };

  const handleRoleSelection = (role) => {
    setSelectedRole(role);
    if (role === 'other') {
      generateLowImpactOptions();
    } else {
      generateAllImpactOptions(role);
    }
  };

  const generateAllImpactOptions = (roleTitle) => {
    const currentKeyword = analysis.keyword_coverage.missing_keywords[currentGapIndex];
    const keywordText = typeof currentKeyword === 'string' ? currentKeyword : currentKeyword.keyword;
    
    const lines = editableResume.split('\n');
    let roleStartIndex = -1;
    let roleEndIndex = -1;
    
    lines.forEach((line, index) => {
      if (line.includes(roleTitle) && roleStartIndex === -1) {
        roleStartIndex = index;
      }
      if (roleStartIndex !== -1 && roleEndIndex === -1) {
        if (index > roleStartIndex && line.match(/^[A-Z]/)) {
          roleEndIndex = index;
        }
      }
    });
    
    if (roleEndIndex === -1) roleEndIndex = lines.length;
    
    let bestBullet = null;
    let bestScore = 0;
    
    for (let i = roleStartIndex; i < roleEndIndex; i++) {
      const line = lines[i];
      if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
        let score = line.length > 50 ? 2 : 1;
        if (score > bestScore) {
          bestScore = score;
          bestBullet = { lineIndex: i, text: line };
        }
      }
    }
    
    const options = {
      high: bestBullet ? {
        type: 'experience',
        location: bestBullet,
        original: bestBullet.text.trim(),
        suggested: bestBullet.text.trim().replace(/\.$/, '') + `, incorporating ${keywordText}.`
      } : null,
      medium: {
        type: 'summary',
        suggested: `Dynamic Product Designer specializing in ${keywordText}...`
      },
      low: {
        type: 'skills',
        suggested: keywordText
      }
    };
    
    setImpactOptions(options);
  };

  const generateLowImpactOptions = () => {
    const currentKeyword = analysis.keyword_coverage.missing_keywords[currentGapIndex];
    const keywordText = typeof currentKeyword === 'string' ? currentKeyword : currentKeyword.keyword;
    
    setImpactOptions({
      high: null,
      medium: {
        type: 'summary',
        suggested: `Product Designer with interest in ${keywordText}...`
      },
      low: {
        type: 'skills',
        suggested: keywordText
      }
    });
  };

  const handleAddWithImpact = (impactLevel) => {
    const currentKeyword = analysis.keyword_coverage.missing_keywords[currentGapIndex];
    const keywordText = typeof currentKeyword === 'string' ? currentKeyword : currentKeyword.keyword;
    const option = impactOptions[impactLevel];
    
    if (!option) return;
    
    let newResume = editableResume;
    
    if (impactLevel === 'high' && option.location) {
      const lines = newResume.split('\n');
      lines[option.location.lineIndex] = option.suggested;
      newResume = lines.join('\n');
    } else if (impactLevel === 'medium') {
      const lines = newResume.split('\n');
      let insertIndex = 3;
      lines.splice(insertIndex, 0, option.suggested);
      newResume = lines.join('\n');
    } else if (impactLevel === 'low') {
      if (newResume.toLowerCase().includes('skills')) {
        const lines = newResume.split('\n');
        let skillsIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes('skills')) {
            skillsIndex = i;
            break;
          }
        }
        
        if (skillsIndex !== -1 && skillsIndex + 1 < lines.length) {
          lines[skillsIndex + 1] = lines[skillsIndex + 1].trim() + `, ${keywordText}`;
          newResume = lines.join('\n');
        }
      } else {
        newResume = newResume.trim() + `\n\nSKILLS:\n${keywordText}`;
      }
    }
    
    setEditableResume(newResume);
    setAddedKeywords([...addedKeywords, keywordText]);
    handleSkipToNext();
  };

  const handleSkipToNext = () => {
    const nextIndex = currentGapIndex + 1;
    
    setUserHasExperience(null);
    setSelectedRole('');
    setImpactOptions(null);
    
    if (nextIndex < analysis.keyword_coverage.missing_keywords.length) {
      setCurrentGapIndex(nextIndex);
    } else {
      setCurrentGapIndex(nextIndex);
    }
  };

  const recalculateKeywords = () => {
    if (!analysis || !editableResume) return;
    
    const matched = analysis.keyword_coverage.matched_keywords.filter(kw => {
      const keyword = typeof kw === 'string' ? kw : kw.keyword;
      return editableResume.toLowerCase().includes(keyword.toLowerCase());
    });
    
    const nowMatched = analysis.keyword_coverage.missing_keywords.filter(kw => {
      const keyword = typeof kw === 'string' ? kw : kw.keyword;
      return editableResume.toLowerCase().includes(keyword.toLowerCase());
    });
    
    return {
      matched: [...matched, ...nowMatched],
      total: analysis.keyword_coverage.matched_keywords.length + 
             analysis.keyword_coverage.missing_keywords.length
    };
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editableResume);
    alert('Resume copied to clipboard!');
  };

  const highlightKeywords = (text) => {
    if (!analysis) return text;
    
    let highlighted = text;
    const allMatchedKeywords = [
      ...(analysis.keyword_coverage.matched_keywords || []),
      ...addedKeywords
    ];
    
    const sortedKeywords = allMatchedKeywords
      .map(kw => typeof kw === 'string' ? kw : kw.keyword)
      .sort((a, b) => b.length - a.length);
    
    sortedKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
      highlighted = highlighted.replace(regex, '<mark style="background-color: #86efac; padding: 2px 4px; border-radius: 3px;">$1</mark>');
    });
    
    return highlighted;
  };

  const resetApp = (e) => {
    if (e) e.preventDefault();
    
    setCurrentView('input');
    setAnalysis(null);
    setCurrentGapIndex(0);
    setAddedKeywords([]);
    setError('');
    setUserHasExperience(null);
    setSelectedRole('');
    setImpactOptions(null);
  };

  // Input View
  if (currentView === 'input') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Sparkles className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">Resume Tailor</h1>
            <p className="text-xl text-gray-600">Optimize your resume with AI-powered keyword matching</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-semibold text-gray-700">
                  Your Resume
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInputMethod('paste')}
                    className={`py-1.5 px-4 text-sm rounded-lg font-medium transition-colors ${
                      inputMethod === 'paste'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    ✏️ Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMethod('upload')}
                    className={`py-1.5 px-4 text-sm rounded-lg font-medium transition-colors ${
                      inputMethod === 'upload'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    📁 Upload
                  </button>
                </div>
              </div>

              {inputMethod === 'paste' && (
                <div>
                  <textarea
                    value={resumeInput}
                    onChange={handleResumeTextChange}
                    placeholder="Paste your resume text here...

Include your name, contact info, work experience, education, and skills."
                    className="w-full h-96 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-500">{resumeInput.length} characters</span>
                    {resumeInput.length >= 100 && (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        Ready
                      </span>
                    )}
                  </div>
                </div>
              )}

              {inputMethod === 'upload' && (
                <div>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      accept=".txt,text/plain"
                      className="hidden"
                      id="resume-upload"
                    />
                    <label htmlFor="resume-upload" className="cursor-pointer">
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-600 font-medium">
                        {resume.filename && resume.filename !== 'pasted-resume.txt' 
                          ? resume.filename 
                          : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">Plain text (.txt) only • Max 5MB</p>
                    </label>
                  </div>
                  {resume.filename && resume.filename !== 'pasted-resume.txt' && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span>Uploaded: {resume.filename}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Job Description
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the full job description here..."
                className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-500">{jobDescription.length} characters (minimum 200)</span>
                {jobDescription.length >= 200 && (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Ready
                  </span>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">
                Paste the FULL job description for best results. Include requirements, responsibilities, and qualifications.
              </p>
            </div>
          </div>

          <button
            onClick={analyzeResume}
            type="button"
            disabled={!resume.text || jobDescription.length < 200 || loading}
            className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Analyze Resume
          </button>
        </div>
      </div>
    );
  }

  // Analyzing View
  if (currentView === 'analyzing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
        <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full">
            <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Analyzing your resume...</h2>
          <div className="space-y-3 text-left max-w-md mx-auto">
            <div className="flex items-center gap-3 text-gray-600">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span>Processing with GPT-4o...</span>
            </div>
          </div>
          <p className="text-sm text-gray-500">This usually takes 15-30 seconds</p>
        </div>
      </div>
    );
  }

  // Results View - this needs to continue in next message due to length
  return null;
};

export default App;