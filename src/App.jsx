import React, { useState } from 'react';
import { Upload, Sparkles, Download, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';

const App = () => {
  const [currentView, setCurrentView] = useState('input');
  const [resume, setResume] = useState({ text: '', filename: '' });
  const [resumeInput, setResumeInput] = useState('');
  const [editableResume, setEditableResume] = useState(''); // For left panel editing
  const [inputMethod, setInputMethod] = useState('paste');
  const [jobDescription, setJobDescription] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [optimizedResume, setOptimizedResume] = useState({ text: '', changes: [] });
  const [selectedGaps, setSelectedGaps] = useState([]);
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [expandedGaps, setExpandedGaps] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentGapIndex, setCurrentGapIndex] = useState(0);
  const [suggestedSentence, setSuggestedSentence] = useState('');
  const [addedKeywords, setAddedKeywords] = useState([]);
  const [generatingSuggestion, setGeneratingSuggestion] = useState(false);
  const [suggestedLocation, setSuggestedLocation] = useState(null); // { lineStart, lineEnd, text }

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
        setError('❌ RTF format detected. Please copy and paste your resume text instead, or convert to plain text first.');
        setInputMethod('paste');
        return;
      }
      
      if (text.includes('\\documentclass') || text.includes('\\begin{document}') || 
          text.includes('\\item') || text.includes('\\textbf')) {
        setError('❌ LaTeX format detected. Please copy and paste your resume text instead.');
        setInputMethod('paste');
        return;
      }
      
      if (text.includes('<html') || text.includes('<!DOCTYPE') || 
          (text.includes('<p>') && text.includes('<div>'))) {
        setError('❌ HTML format detected. Please copy and paste your resume text instead.');
        setInputMethod('paste');
        return;
      }
      
      if (text.includes('PK\x03\x04') || text.substring(0, 4) === 'PK\x03\x04') {
        setError('❌ Word document detected. Please copy and paste your resume text instead.');
        setInputMethod('paste');
        return;
      }
      
      if (text.includes('\x00') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
        setError('❌ File contains binary data. Please copy and paste your resume text instead.');
        setInputMethod('paste');
        return;
      }
      
      text = text.trim();
      
      if (text.length < 100) {
        setError('Resume is too short (less than 100 characters). Please provide a complete resume.');
        return;
      }
      
      console.log('✓ Resume validated successfully');
      console.log('Length:', text.length, 'chars');
      
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
      setEditableResume(resume.text); // Initialize editable resume
      setCurrentGapIndex(0);
      setAddedKeywords([]);
      setCurrentView('results');
      
      // Find location for first keyword if there are missing keywords
      if (data.keyword_coverage?.missing_keywords?.length > 0) {
        findBestLocationForKeyword(data.keyword_coverage.missing_keywords[0], resume.text);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Analysis failed. Please try again. Error: ' + err.message);
      setCurrentView('input');
    } finally {
      setLoading(false);
    }
  };

  const generateOptimized = async (e) => {
    if (e) e.preventDefault();
    
    setCurrentView('analyzing');
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/.netlify/functions/writer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: resume.text,
          jobDescription: jobDescription,
          analysis: analysis,
          selectedGaps: selectedGaps
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Optimization failed');
      }

      const data = await response.json();
      
      if (!data.text) {
        throw new Error('No optimized resume text received');
      }
      
      setOptimizedResume(data);
      setAnalysis({ 
        ...analysis, 
        overall_score: data.newScore || analysis.overall_score + 20, 
        match_strength: (data.newScore || analysis.overall_score + 20) >= 71 ? 'strong' : 'moderate' 
      });
      setCurrentView('comparison');
    } catch (err) {
      console.error('Optimization error:', err);
      setError('Optimization failed. Please try again. Error: ' + err.message);
      setCurrentView('results');
    } finally {
      setLoading(false);
    }
  };

  const getMatchStrength = (score) => {
    if (score >= 91) return { color: 'text-purple-600', bg: 'bg-purple-50', label: '⭐ EXCEPTIONAL MATCH' };
    if (score >= 71) return { color: 'text-green-600', bg: 'bg-green-50', label: '🟢 STRONG MATCH' };
    if (score >= 41) return { color: 'text-amber-600', bg: 'bg-amber-50', label: '🟡 MODERATE MATCH' };
    return { color: 'text-red-600', bg: 'bg-red-50', label: '🔴 WEAK MATCH' };
  };

  const downloadResume = (e) => {
    if (e) e.preventDefault();
    
    const element = document.createElement('a');
    const file = new Blob([optimizedResume.text], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Resume_Optimized_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const resetApp = (e) => {
    if (e) e.preventDefault();
    
    setCurrentView('input');
    // Keep resume and JD pre-filled
    setAnalysis(null);
    setOptimizedResume({ text: '', changes: [] });
    setSelectedGaps([]);
    setShowAllGaps(false);
    setExpandedGaps({});
    setError('');
    setCurrentGapIndex(0);
    setAddedKeywords([]);
    setSuggestedSentence('');
  };

  const findBestLocationForKeyword = (keyword, currentResume) => {
    const keywordText = typeof keyword === 'string' ? keyword : keyword.keyword;
    const lines = currentResume.split('\n');
    
    // Look for relevant sections: Experience, Skills, or last bullet point in recent role
    let bestMatch = null;
    let bestScore = 0;
    
    // Search for experience section or recent roles
    const experienceKeywords = ['experience', 'work', 'freelance', 'designer', 'lead', 'senior'];
    const aiKeywords = ['ai', 'design', 'product', 'ux', 'user'];
    
    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();
      let score = 0;
      
      // Prioritize lines with bullets
      if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
        score += 2;
      }
      
      // Prioritize experience-related lines
      experienceKeywords.forEach(kw => {
        if (lowerLine.includes(kw)) score += 1;
      });
      
      // Prioritize AI/design related lines
      aiKeywords.forEach(kw => {
        if (lowerLine.includes(kw)) score += 1;
      });
      
      // Prefer lines with some content (not headers)
      if (line.length > 40) score += 1;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { lineIndex: index, text: line };
      }
    });
    
    setSuggestedLocation(bestMatch);
  };

  const handleAddKeywordAtLocation = () => {
    if (!suggestedLocation) return;
    
    const lines = editableResume.split('\n');
    const currentKeyword = analysis.keyword_coverage.missing_keywords[currentGapIndex];
    const keywordText = typeof currentKeyword === 'string' ? currentKeyword : currentKeyword.keyword;
    
    // Add keyword to the suggested line
    const lineIndex = suggestedLocation.lineIndex;
    const originalLine = lines[lineIndex];
    
    // Add keyword at the end of the line (before any period)
    let newLine = originalLine.trim();
    if (newLine.endsWith('.')) {
      newLine = newLine.slice(0, -1) + `, incorporating ${keywordText}.`;
    } else {
      newLine = newLine + `, incorporating ${keywordText}`;
    }
    
    lines[lineIndex] = newLine;
    const newResume = lines.join('\n');
    
    setEditableResume(newResume);
    setAddedKeywords([...addedKeywords, keywordText]);
    
    handleSkipKeyword();
  };

  const handleAddKeywordManually = () => {
    // Just add keyword to the end of resume in Skills or as new bullet
    const currentKeyword = analysis.keyword_coverage.missing_keywords[currentGapIndex];
    const keywordText = typeof currentKeyword === 'string' ? currentKeyword : currentKeyword.keyword;
    
    // Check if there's a Skills section
    if (editableResume.toLowerCase().includes('skills')) {
      const lines = editableResume.split('\n');
      let skillsIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('skills')) {
          skillsIndex = i;
          break;
        }
      }
      
      if (skillsIndex !== -1 && skillsIndex + 1 < lines.length) {
        // Add to skills section
        lines[skillsIndex + 1] = lines[skillsIndex + 1].trim() + `, ${keywordText}`;
        setEditableResume(lines.join('\n'));
      }
    } else {
      // Add as new entry at the end
      setEditableResume(editableResume.trim() + `\n\nSKILLS:\n${keywordText}`);
    }
    
    setAddedKeywords([...addedKeywords, keywordText]);
    handleSkipKeyword();
  };

  const handleSkipKeyword = () => {
    const nextIndex = currentGapIndex + 1;
    
    if (nextIndex < analysis.keyword_coverage.missing_keywords.length) {
      setCurrentGapIndex(nextIndex);
      findBestLocationForKeyword(
        analysis.keyword_coverage.missing_keywords[nextIndex],
        editableResume
      );
    } else {
      setCurrentGapIndex(nextIndex);
      setSuggestedLocation(null);
    }
  };

  const handleResumeEdit = (e) => {
    setEditableResume(e.target.value);
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
    
    allMatchedKeywords.forEach(kw => {
      const keyword = typeof kw === 'string' ? kw : kw.keyword;
      const regex = new RegExp(`(${keyword})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark class="bg-green-200">$1</mark>');
    });
    
    return highlighted;
  };

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
                  
                  <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-900 mb-1">💡 How to convert to plain text:</p>
                    <ul className="text-xs text-blue-800 space-y-1 ml-4">
                      <li>• <strong>Mac:</strong> TextEdit → Format → Make Plain Text</li>
                      <li>• <strong>Windows:</strong> Word → Save As → Plain Text (.txt)</li>
                      <li>• <strong>Google Docs:</strong> File → Download → Plain Text (.txt)</li>
                    </ul>
                  </div>
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

  if (currentView === 'analyzing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
        <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full">
            <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            {optimizedResume.text ? 'Generating optimized resume...' : 'Analyzing your resume...'}
          </h2>
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

  if (currentView === 'results' && analysis) {
    const stats = recalculateKeywords();
    const totalKeywords = stats?.total || 
      ((analysis.keyword_coverage.matched_keywords?.length || 0) + 
       (analysis.keyword_coverage.missing_keywords?.length || 0));
    const matchedCount = stats?.matched?.length || analysis.keyword_coverage.matched_keywords?.length || 0;
    const missingKeywords = analysis.keyword_coverage.missing_keywords || [];
    const currentKeyword = currentGapIndex < missingKeywords.length ? missingKeywords[currentGapIndex] : null;
    const keywordText = currentKeyword ? (typeof currentKeyword === 'string' ? currentKeyword : currentKeyword.keyword) : '';
    const allDone = currentGapIndex >= missingKeywords.length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel - Editable Resume */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Your Resume (Editable)</h3>
                <textarea
                  value={editableResume}
                  onChange={handleResumeEdit}
                  onBlur={recalculateKeywords}
                  className="w-full h-[600px] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
                  placeholder="Your resume text..."
                />
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={copyToClipboard}
                    type="button"
                    className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Copy Resume
                  </button>
                  <button
                    onClick={resetApp}
                    type="button"
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:border-gray-400 transition-colors"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </div>

            {/* Right Panel - Stats and Suggestions */}
            <div className="space-y-4">
              {/* Stats Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Match Analysis</h3>
                
                <div className="mb-6">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-4xl font-bold text-gray-900">{matchedCount}</span>
                    <span className="text-xl text-gray-500">/ {totalKeywords} keywords</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                    <div 
                      className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((matchedCount / Math.max(totalKeywords, 1)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600">
                    {Math.round((matchedCount / Math.max(totalKeywords, 1)) * 100)}% match
                  </p>
                </div>

                {/* Matched Keywords */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-green-900 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Keywords Found ({matchedCount})
                  </h4>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {analysis.keyword_coverage.matched_keywords?.map((kw, i) => {
                      const keyword = typeof kw === 'string' ? kw : kw.keyword;
                      return (
                        <span key={i} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs border border-green-200">
                          {keyword}
                        </span>
                      );
                    })}
                    {addedKeywords.map((kw, i) => (
                      <span key={`added-${i}`} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs border border-green-200">
                        {kw} ✨
                      </span>
                    ))}
                  </div>
                </div>

                {/* Missing Keywords Count */}
                {missingKeywords.length > 0 && !allDone && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-900">
                      <strong>{missingKeywords.length - currentGapIndex}</strong> keywords remaining to review
                    </p>
                  </div>
                )}
              </div>

              {/* Suggestion Card */}
              {!allDone && currentKeyword ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-700">
                        Missing Keyword {currentGapIndex + 1} of {missingKeywords.length}
                      </h4>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${
                        currentKeyword.risk === 'low' ? 'bg-green-100 text-green-800' :
                        currentKeyword.risk === 'high' ? 'bg-red-100 text-red-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {currentKeyword.risk === 'low' ? '🟢 LOW RISK' :
                         currentKeyword.risk === 'high' ? '🔴 HIGH RISK' :
                         '🟡 MEDIUM RISK'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">"{keywordText}"</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {currentKeyword.risk === 'low' && 'Safe to add if you have this skill or experience'}
                      {currentKeyword.risk === 'medium' && 'Add if you can discuss this in interviews'}
                      {currentKeyword.risk === 'high' && '⚠️ Only add if this was your actual role/title'}
                    </p>
                  </div>

                  {suggestedLocation ? (
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        💡 Suggested location in your resume:
                      </label>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
                        <p className="text-xs text-blue-700 mb-2">Line {suggestedLocation.lineIndex + 1}:</p>
                        <p className="text-sm text-gray-800 italic">"{suggestedLocation.text.trim()}"</p>
                      </div>
                      <p className="text-xs text-gray-600 mb-3">
                        You can add "<strong>{keywordText}</strong>" to this line, or manually add it anywhere in your resume.
                      </p>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
                        Manually add "<strong>{keywordText}</strong>" to a relevant section in your resume (Experience, Skills, or Summary).
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {suggestedLocation && (
                      <button
                        onClick={handleAddKeywordAtLocation}
                        type="button"
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-5 h-5" />
                        Add to Suggested Location
                      </button>
                    )}
                    <button
                      onClick={handleAddKeywordManually}
                      type="button"
                      className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Add to Skills Section
                    </button>
                    <button
                      onClick={handleSkipKeyword}
                      type="button"
                      className="w-full bg-white border-2 border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:border-gray-400 transition-colors"
                    >
                      Skip This Keyword
                    </button>
                  </div>
                </div>
              ) : allDone ? (
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-xl p-8 text-center">
                  <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">All Done! 🎉</h3>
                  <p className="text-gray-700 mb-4">
                    You've reviewed all {missingKeywords.length} missing keywords.
                  </p>
                  <p className="text-sm text-gray-600">
                    Your resume now has <strong>{matchedCount}</strong> out of <strong>{totalKeywords}</strong> keywords
                    ({Math.round((matchedCount / Math.max(totalKeywords, 1)) * 100)}% match)
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'comparison' && optimizedResume.text) {
    const strength = getMatchStrength(analysis.overall_score);

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-xl p-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Optimization Complete! 🎉</h2>
            <div className="text-4xl font-bold text-green-600 mb-2">
              Score: {analysis.overall_score}/100
            </div>
            <div className="text-lg text-gray-700 mb-6">
              Match Strength: <span className={`${strength.color} font-semibold`}>{strength.label}</span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Original</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
                {resume.text}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Optimized</h3>
              <div className="bg-green-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
                {optimizedResume.text}
              </div>
            </div>
          </div>

          {optimizedResume.changes && optimizedResume.changes.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-4">Changes Made ({optimizedResume.changes.length} total):</h3>
              <div className="space-y-4">
                {optimizedResume.changes.map((change, i) => (
                  <div key={i} className="border-l-4 border-blue-500 pl-4 py-2">
                    <div className="text-sm font-semibold text-gray-900 mb-1">
                      {i + 1}. {change.location || 'Updated section'}
                    </div>
                    {change.before && (
                      <div className="text-sm text-gray-600 mb-1">
                        <span className="font-medium">Original:</span> "{change.before}"
                      </div>
                    )}
                    {change.after && (
                      <div className="text-sm text-gray-600 mb-1">
                        <span className="font-medium">Updated:</span> "{change.after}"
                      </div>
                    )}
                    {change.keyword && (
                      <div className="text-xs text-green-700">
                        Added: "{change.keyword}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={downloadResume}
              type="button"
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Download Optimized Resume
            </button>
            <button
              onClick={resetApp}
              type="button"
              className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:border-gray-400 transition-colors"
            >
              Try Another Job
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default App;