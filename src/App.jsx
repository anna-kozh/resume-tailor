import React, { useState } from 'react';
import { Upload, Sparkles, Download, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';

const App = () => {
  const [currentView, setCurrentView] = useState('input');
  const [resume, setResume] = useState({ text: '', filename: '' });
  const [jobDescription, setJobDescription] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [optimizedResume, setOptimizedResume] = useState({ text: '', changes: [] });
  const [selectedGaps, setSelectedGaps] = useState([]);
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [expandedGaps, setExpandedGaps] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File is too large. Maximum size is 5MB.');
      return;
    }

    const reader = new FileReader();

    reader.onload = async (event) => {
      let text = event.target.result;
      
      // Detect and handle RTF format
      if (text.startsWith('{\\rtf') || text.includes('\\rtf1')) {
        setError('❌ RTF format detected. Please convert your file to plain text (.txt) first.\n\nHow to convert:\n• Mac: Open in TextEdit → Format → Make Plain Text → Save\n• Windows: Open in Word → Save As → Plain Text (.txt)');
        return;
      }
      
      // Detect LaTeX format
      if (text.includes('\\documentclass') || text.includes('\\begin{document}') || 
          text.includes('\\item') || text.includes('\\textbf')) {
        setError('❌ LaTeX format detected. Please convert to plain text first.');
        return;
      }
      
      // Detect HTML format
      if (text.includes('<html') || text.includes('<!DOCTYPE') || 
          (text.includes('<p>') && text.includes('<div>'))) {
        setError('❌ HTML format detected. Please save as plain text (.txt) instead.');
        return;
      }
      
      // Detect Word/DOCX format (binary)
      if (text.includes('PK\x03\x04') || text.substring(0, 4) === 'PK\x03\x04') {
        setError('❌ Word document detected. Please save as plain text (.txt):\n\n• Open in Word → File → Save As → File Format: Plain Text (.txt)');
        return;
      }
      
      // Check if text has weird encoding characters
      if (text.includes('\x00') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
        setError('❌ File contains binary data or special encoding. Please ensure it\'s saved as UTF-8 plain text.');
        return;
      }
      
      // Clean up the text
      text = text.trim();
      
      // Check minimum length
      if (text.length < 100) {
        setError('Resume is too short (less than 100 characters). Please upload a complete resume.');
        return;
      }
      
      // Check if it looks like actual resume content
      const hasName = /[A-Z][a-z]+ [A-Z][a-z]+/.test(text.substring(0, 200));
      const hasEmail = /\S+@\S+\.\S+/.test(text);
      const hasCommonWords = /experience|education|skills|work|employment/i.test(text);
      
      if (!hasCommonWords && text.length < 500) {
        setError('⚠️ This doesn\'t look like a complete resume. Please ensure you\'ve uploaded the right file.');
        return;
      }
      
      console.log('✓ Resume validated successfully');
      console.log('Length:', text.length, 'chars');
      console.log('First 100 chars:', text.substring(0, 100));
      
      setResume({ text, filename: file.name });
    };

    reader.onerror = () => {
      setError('Failed to read file. Please try again or try a different file.');
    };

    // Read as text with UTF-8 encoding
    reader.readAsText(file, 'UTF-8');
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
      setCurrentView('results');
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

  const toggleGapExpansion = (keyword) => {
    setExpandedGaps(prev => ({
      ...prev,
      [keyword]: !prev[keyword]
    }));
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
    setResume({ text: '', filename: '' });
    setJobDescription('');
    setAnalysis(null);
    setOptimizedResume({ text: '', changes: [] });
    setSelectedGaps([]);
    setShowAllGaps(false);
    setExpandedGaps({});
    setError('');
  };

  const renderInputView = () => (
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
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Upload Your Resume (Plain Text Only)
          </label>
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
                {resume.filename || 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs text-gray-500 mt-2">Plain text (.txt) format only</p>
              <p className="text-xs text-gray-400 mt-1">Max file size: 5MB</p>
            </label>
          </div>
          {resume.filename && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span>Uploaded: {resume.filename}</span>
            </div>
          )}
          
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-900 mb-1">📄 How to convert to plain text:</p>
            <ul className="text-xs text-blue-800 space-y-1 ml-4">
              <li>• <strong>Mac:</strong> TextEdit → Format → Make Plain Text</li>
              <li>• <strong>Windows:</strong> Word → Save As → Plain Text (.txt)</li>
              <li>• <strong>Google Docs:</strong> File → Download → Plain Text (.txt)</li>
            </ul>
          </div>
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
  );

  const renderAnalyzingView = () => (
    <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full">
        <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900">
        {currentView === 'analyzing' && !optimizedResume.text ? 'Analyzing your resume...' : 'Generating optimized resume...'}
      </h2>
      <div className="space-y-3 text-left max-w-md mx-auto">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Processing with GPT-4o...</span>
        </div>
      </div>
      <p className="text-sm text-gray-500">This usually takes 15-30 seconds</p>
    </div>
  );

  const renderResultsView = () => {
    if (!analysis) return null;
    const strength = getMatchStrength(analysis.overall_score);

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className={`${strength.bg} border-2 border-current ${strength.color} rounded-xl p-8`}>
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold">{strength.label}</h2>
            <p className="text-lg">Your resume {analysis.overall_score >= 71 ? 'strongly' : 'moderately'} aligns with this job description</p>
            
            <div className="flex items-center justify-center gap-8 mt-6">
              <div>
                <div className="text-sm font-semibold mb-1">Keyword Coverage</div>
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="text-2xl">
                      {i < Math.floor(analysis.keyword_coverage.score / 12.5) ? '⭐' : '☆'}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Language Alignment</div>
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="text-2xl">
                      {i < Math.floor(analysis.language_alignment.score / 10) ? '⭐' : '☆'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-600 mb-4">
            Detailed Score: <span className="text-2xl font-bold text-gray-900">{analysis.overall_score}/100</span>
          </div>
          
          <div className="space-y-3 mb-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Keyword Coverage</span>
                <span>{analysis.keyword_coverage.score}/{analysis.keyword_coverage.max_score}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${(analysis.keyword_coverage.score / analysis.keyword_coverage.max_score) * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Language Alignment</span>
                <span>{analysis.language_alignment.score}/{analysis.language_alignment.max_score}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${(analysis.language_alignment.score / analysis.language_alignment.max_score) * 100}%` }} />
              </div>
            </div>
          </div>

          {analysis.keyword_coverage.matched_keywords && analysis.keyword_coverage.matched_keywords.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-green-900 mb-2">Excellent coverage of:</h3>
              <div className="flex flex-wrap gap-2">
                {analysis.keyword_coverage.matched_keywords.map((keyword, i) => (
                  <span key={i} className="bg-white px-3 py-1 rounded-full text-sm text-green-800 border border-green-200">
                    ✓ {typeof keyword === 'string' ? keyword : keyword.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.keyword_coverage.missing_keywords && analysis.keyword_coverage.missing_keywords.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="font-semibold text-amber-900 mb-2">Key gaps identified:</h3>
              <p className="text-sm text-amber-800">
                ⚠ {analysis.keyword_coverage.missing_keywords.length} missing keywords
              </p>
            </div>
          )}
        </div>

        {showAllGaps && analysis.keyword_coverage.missing_keywords && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
            <h3 className="text-xl font-bold text-gray-900">Missing Keywords</h3>
            
            <div className="space-y-3">
              {analysis.keyword_coverage.missing_keywords.map((gap, i) => {
                const gapKeyword = typeof gap === 'string' ? gap : gap.keyword;
                const gapRisk = gap.risk || 'medium';
                const gapPoints = gap.points || 2;

                return (
                  <div key={i} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        id={`gap-${i}`}
                        checked={selectedGaps.includes(gapKeyword)}
                        onChange={() => {
                          setSelectedGaps(prev =>
                            prev.includes(gapKeyword)
                              ? prev.filter(k => k !== gapKeyword)
                              : [...prev, gapKeyword]
                          );
                        }}
                        className="w-4 h-4"
                      />
                      <label htmlFor={`gap-${i}`} className="font-medium text-gray-900">
                        "{gapKeyword}" <span className="text-blue-600">+{gapPoints} pts</span>
                      </label>
                    </div>
                    <p className="text-sm text-gray-600 ml-6">
                      Risk: {gapRisk.toUpperCase()}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => setShowAllGaps(!showAllGaps)}
            type="button"
            className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
          >
            {showAllGaps ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            {showAllGaps ? 'Hide' : 'Show'} Missing Keywords
          </button>
          <button
            onClick={generateOptimized}
            type="button"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            {loading ? 'Generating...' : 'Generate Optimized Resume'}
          </button>
        </div>
      </div>
    );
  };

  const renderComparisonView = () => {
    const strength = getMatchStrength(analysis.overall_score);

    return (
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
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
      {currentView === 'input' && renderInputView()}
      {currentView === 'analyzing' && renderAnalyzingView()}
      {currentView === 'results' && renderResultsView()}
      {currentView === 'comparison' && renderComparisonView()}
    </div>
  );
};

export default App;