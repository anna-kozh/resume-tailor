import React, { useState } from 'react';
import { Upload, Sparkles, Download, AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';
import ResumeEditor from './components/ResumeEditor';

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
  const [appliedKeywords, setAppliedKeywords] = useState([]); // Track applied keywords for green highlighting
  const [generatingSuggestion, setGeneratingSuggestion] = useState(false);
  const [suggestedLocation, setSuggestedLocation] = useState(null); // { lineStart, lineEnd, text }
  const [currentHighlight, setCurrentHighlight] = useState(null); // For yellow highlighting

  // Field-level errors for red borders + messages
  const [resumeFieldError, setResumeFieldError] = useState('');
  const [jdFieldError, setJdFieldError] = useState('');

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    setResumeFieldError(''); // clear field error on interaction
    
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
      setResumeFieldError(''); // ensure cleared
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
    if (text && resumeFieldError) setResumeFieldError('');
  };

  const analyzeResume = async (e) => {
    if (e) e.preventDefault();

    // Required checks per field
    let hasError = false;
    if (!resume.text) {
      setResumeFieldError('This field is required');
      hasError = true;
    } else {
      setResumeFieldError('');
    }
    if (!jobDescription) {
      setJdFieldError('This field is required');
      hasError = true;
    } else {
      setJdFieldError('');
    }
    if (hasError) return;

    // Keep existing min-length rule as-is (unchanged by your request)
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
      setAppliedKeywords([]); // Reset applied keywords
      setCurrentView('results');
      
      // Find location for first keyword if there are missing keywords
      if (data.keyword_coverage?.missing_keywords?.length > 0) {
        const firstKeyword = data.keyword_coverage.missing_keywords[0];
        const keywordText = typeof firstKeyword === 'string' ? firstKeyword : firstKeyword.keyword;
        setSuggestedSentence(keywordText); // Initialize with keyword text
        findBestLocationForKeyword(firstKeyword, resume.text);
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
      setOptimizedResume(data);
      setCurrentView('comparison');
    } catch (err) {
      console.error('Optimization error:', err);
      setError('Optimization failed. Please try again.');
      setCurrentView('results');
    } finally {
      setLoading(false);
    }
  };

  const downloadResume = () => {
    const blob = new Blob([optimizedResume.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'optimized-resume.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetApp = () => {
    setCurrentView('input');
    setResume({ text: '', filename: '' });
    setResumeInput('');
    setEditableResume('');
    setJobDescription('');
    setAnalysis(null);
    setOptimizedResume({ text: '', changes: [] });
    setSelectedGaps([]);
    setError('');
    setCurrentGapIndex(0);
    setSuggestedSentence('');
    setAddedKeywords([]);
    setAppliedKeywords([]);
    setSuggestedLocation(null);
    setCurrentHighlight(null);
    setResumeFieldError('');
    setJdFieldError('');
  };

  const toggleGapExpanded = (index) => {
    setExpandedGaps(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const getMatchStrength = (score) => {
    if (score >= 90) return { label: 'Excellent Match', color: 'text-green-600' };
    if (score >= 80) return { label: 'Strong Match', color: 'text-blue-600' };
    if (score >= 70) return { label: 'Good Match', color: 'text-yellow-600' };
    if (score >= 60) return { label: 'Fair Match', color: 'text-orange-600' };
    return { label: 'Weak Match', color: 'text-red-600' };
  };

  // Get confidence level from keyword
  const getConfidenceLevel = (keyword) => {
    const confidence = keyword.confidence || 0;
    if (confidence >= 0.9) return { level: 'high', label: 'High confidence', color: 'bg-green-100 text-green-800', icon: '🟢' };
    if (confidence >= 0.7) return { level: 'medium', label: 'Medium confidence', color: 'bg-yellow-100 text-yellow-800', icon: '🟡' };
    return { level: 'low', label: 'Low confidence', color: 'bg-orange-100 text-orange-800', icon: '🟠' };
  };

  // Find best location for keyword in resume
  const findBestLocationForKeyword = (keyword, resumeText) => {
    const keywordText = typeof keyword === 'string' ? keyword : keyword.keyword;
    const lines = resumeText.split('\n');
    
    // Find the most relevant line (simple heuristic: look for related terms)
    const searchTerms = keywordText.toLowerCase().split(/\s+/);
    let bestLineIndex = -1;
    let bestScore = 0;

    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();
      const score = searchTerms.filter(term => lowerLine.includes(term)).length;
      if (score > bestScore) {
        bestScore = score;
        bestLineIndex = index;
      }
    });

    // If no match found, suggest adding to professional summary or first section
    if (bestLineIndex === -1) {
      const summaryIndex = lines.findIndex(line => 
        /summary|profile|about|objective/i.test(line)
      );
      bestLineIndex = summaryIndex >= 0 ? summaryIndex + 1 : 2;
    }

    setSuggestedLocation({
      lineIndex: bestLineIndex,
      text: lines[bestLineIndex] || 'Beginning of resume'
    });

    // Set yellow highlight for current suggestion
    setCurrentHighlight({
      lineIndex: bestLineIndex,
      text: lines[bestLineIndex] || ''
    });
  };

  // Handle applying keyword manually
  const handleAddKeywordManually = () => {
    if (!suggestedSentence.trim() || !suggestedLocation) return;

    const lines = editableResume.split('\n');
    const insertIndex = suggestedLocation.lineIndex;
    
    // Insert the suggested sentence
    lines.splice(insertIndex + 1, 0, suggestedSentence.trim());
    const updatedResume = lines.join('\n');
    
    setEditableResume(updatedResume);
    
    // Add to applied keywords for green highlighting
    const currentKeyword = analysis.keyword_coverage.missing_keywords[currentGapIndex];
    const keywordText = typeof currentKeyword === 'string' ? currentKeyword : currentKeyword.keyword;
    setAppliedKeywords(prev => [...prev, { keyword: keywordText, text: suggestedSentence.trim() }]);
    
    // Move to next suggestion
    handleNextKeyword();
  };

  // Handle skipping keyword
  const handleSkipKeyword = () => {
    handleNextKeyword();
  };

  // Move to next keyword
  const handleNextKeyword = () => {
    const missingKeywords = analysis.keyword_coverage?.missing_keywords || [];
    const nextIndex = currentGapIndex + 1;
    
    if (nextIndex < missingKeywords.length) {
      setCurrentGapIndex(nextIndex);
      const nextKeyword = missingKeywords[nextIndex];
      const keywordText = typeof nextKeyword === 'string' ? nextKeyword : nextKeyword.keyword;
      setSuggestedSentence(keywordText);
      findBestLocationForKeyword(nextKeyword, editableResume);
    } else {
      // All done
      setCurrentHighlight(null);
    }
  };

  // INPUT VIEW
  if (currentView === 'input') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Sparkles className="w-10 h-10 text-blue-600" />
              <h1 className="text-4xl font-bold text-gray-900">Resume Tailor</h1>
            </div>
            <p className="text-lg text-gray-600">
              Optimize your resume with AI-powered keyword matching
            </p>
          </div>

          <form onSubmit={analyzeResume} className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
              <div className="mb-6">
                <label className="block text-lg font-semibold text-gray-900 mb-4">
                  Your Resume
                </label>

                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setInputMethod('paste')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                      inputMethod === 'paste'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Paste Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMethod('upload')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                      inputMethod === 'upload'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Upload File
                  </button>
                </div>

                {inputMethod === 'paste' ? (
                  <div>
                    <textarea
                      value={resumeInput}
                      onChange={handleResumeTextChange}
                      placeholder="Paste your resume text here..."
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${
                        resumeFieldError ? 'border-red-500' : 'border-gray-300'
                      }`}
                      rows={12}
                    />
                    {resumeFieldError && (
                      <p className="mt-2 text-sm text-red-600">{resumeFieldError}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                      resumeFieldError ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50'
                    }`}>
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className={`w-10 h-10 mb-3 ${resumeFieldError ? 'text-red-500' : 'text-gray-400'}`} />
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">Plain text files only (MAX. 5MB)</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept=".txt"
                        onChange={handleFileUpload}
                      />
                    </label>
                    {resume.filename && (
                      <p className="mt-2 text-sm text-green-600">
                        ✓ Loaded: {resume.filename}
                      </p>
                    )}
                    {resumeFieldError && (
                      <p className="mt-2 text-sm text-red-600">{resumeFieldError}</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-lg font-semibold text-gray-900 mb-4">
                  Job Description
                </label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => {
                    setJobDescription(e.target.value);
                    if (e.target.value && jdFieldError) setJdFieldError('');
                  }}
                  placeholder="Paste the job description here..."
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${
                    jdFieldError ? 'border-red-500' : 'border-gray-300'
                  }`}
                  rows={12}
                />
                {jdFieldError && (
                  <p className="mt-2 text-sm text-red-600">{jdFieldError}</p>
                )}
                <p className="mt-2 text-sm text-gray-500">
                  Minimum 200 characters
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Analyze Resume
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ANALYZING VIEW
  if (currentView === 'analyzing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4">
        <div className="text-center">
          <RefreshCw className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing your resume...</h2>
          <p className="text-gray-600">This may take a few moments</p>
        </div>
      </div>
    );
  }

  // RESULTS VIEW
  if (currentView === 'results' && analysis) {
    const strength = getMatchStrength(analysis.overall_score);
    const missingKeywords = analysis.keyword_coverage?.missing_keywords || [];
    const matchedKeywords = analysis.keyword_coverage?.matched_keywords || [];
    const totalKeywords = missingKeywords.length + matchedKeywords.length;
    const matchedCount = matchedKeywords.length + appliedKeywords.length;
    const currentKeyword = missingKeywords[currentGapIndex];
    const keywordText = currentKeyword ? (typeof currentKeyword === 'string' ? currentKeyword : currentKeyword.keyword) : '';
    const allDone = currentGapIndex >= missingKeywords.length;
    const confidenceInfo = currentKeyword ? getConfidenceLevel(currentKeyword) : null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header with score */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Resume Optimization</h1>
            <div className="text-right">
              <div className="text-sm text-gray-600 mb-1">Match score:</div>
              <div className="text-3xl font-bold text-blue-600">{Math.round((matchedCount / Math.max(totalKeywords, 1)) * 100)}%</div>
              <div className="w-64 bg-gray-200 rounded-full h-2.5 mt-2">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${(matchedCount / Math.max(totalKeywords, 1)) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left panel - Resume Editor */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Your Resume</h2>
              <ResumeEditor
                value={editableResume}
                onChange={setEditableResume}
                appliedKeywords={appliedKeywords}
                currentHighlight={currentHighlight}
              />
            </div>

            {/* Right panel - Suggestions */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                {!allDone && (
                  <div className="mb-6">
                    <p className="text-gray-700">
                      I have <span className="text-blue-600">{missingKeywords.length}</span> {missingKeywords.length === 1 ? 'suggestion' : 'suggestions'} for you
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Review each suggestion below
                    </p>
                  </div>
                )}
              </div>

              {/* Suggestion Card */}
              {!allDone && currentKeyword ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-500">
                        Suggestion {currentGapIndex + 1} of {missingKeywords.length}
                      </h4>
                      {confidenceInfo && (
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${confidenceInfo.color}`}>
                          {confidenceInfo.icon} {confidenceInfo.label.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Add: "{keywordText}"</h3>
                  </div>

                  {/* Editable suggestion text */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Suggested text (editable):
                    </label>
                    <textarea
                      value={suggestedSentence || keywordText}
                      onChange={(e) => setSuggestedSentence(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={3}
                      placeholder="Edit the suggestion before applying..."
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      💡 You can edit this text before applying it to your resume
                    </p>
                  </div>

                  {suggestedLocation && (
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        💡 Best place to add:
                      </label>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-xs text-blue-700 mb-2">Line {suggestedLocation.lineIndex + 1}:</p>
                        <p className="text-sm text-gray-800 italic">"{suggestedLocation.text.trim()}"</p>
                      </div>
                    </div>
                  )}

                  {/* Why was it suggested */}
                  {currentKeyword.reasoning && (
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => toggleGapExpanded(currentGapIndex)}
                        className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                      >
                        Why was it suggested? {expandedGaps[currentGapIndex] ? '▲' : '▼'}
                      </button>
                      {expandedGaps[currentGapIndex] && (
                        <div className="mt-3 space-y-2">
                          {currentKeyword.reasoning.map((reason, idx) => (
                            <p key={idx} className="text-sm text-gray-700">• {reason}</p>
                          ))}
                          {currentKeyword.jd_quote && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs font-semibold text-gray-600 mb-1">📋 From Job Description:</p>
                              <p className="text-sm text-gray-700 italic">"{currentKeyword.jd_quote}"</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {confidenceInfo && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">{confidenceInfo.label}:</span> {
                          confidenceInfo.level === 'high' ? 'Explicit match with proof in your resume' :
                          confidenceInfo.level === 'medium' ? 'Strong connection, same concept with different wording' :
                          'Related but inferred from context'
                        }
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleAddKeywordManually}
                      type="button"
                      className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Apply
                    </button>
                    <button
                      onClick={handleSkipKeyword}
                      type="button"
                      className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:border-gray-400 transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ) : allDone ? (
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-xl p-8 text-center">
                  <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">All Done! 🎉</h3>
                  <p className="text-gray-700 mb-4">
                    You've reviewed all {missingKeywords.length} suggestions.
                  </p>
                  <p className="text-sm text-gray-600">
                    Your resume now has <strong>{matchedCount}</strong> out of <strong>{totalKeywords}</strong> keywords
                    ({Math.round((matchedCount / Math.max(totalKeywords, 1)) * 100)}% match)
                  </p>
                  <button
                    onClick={() => {
                      const blob = new Blob([editableResume], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'optimized-resume.txt';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="mt-6 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Download Resume
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default App;
