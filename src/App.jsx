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
    const reader = new FileReader();

    reader.onload = async (event) => {
      const text = event.target.result;
      setResume({ text, filename: file.name });
    };

    reader.readAsText(file);
  };

  const analyzeResume = async () => {
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
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data);
      setCurrentView('results');
    } catch (err) {
      setError('Analysis failed. Please try again. Error: ' + err.message);
      setCurrentView('input');
    } finally {
      setLoading(false);
    }
  };

  const generateOptimized = async () => {
    setCurrentView('analyzing');
    setLoading(true);

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
        throw new Error('Optimization failed');
      }

      const data = await response.json();
      setOptimizedResume(data);
      setAnalysis({ ...analysis, overall_score: data.newScore, match_strength: data.newScore >= 71 ? 'strong' : 'moderate' });
      setCurrentView('comparison');
    } catch (err) {
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

  const downloadResume = () => {
    const element = document.createElement('a');
    const file = new Blob([optimizedResume.text], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Resume_Optimized_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const resetApp = () => {
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
            Upload Your Resume
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
            <input
              type="file"
              onChange={handleFileUpload}
              accept=".txt"
              className="hidden"
              id="resume-upload"
            />
            <label htmlFor="resume-upload" className="cursor-pointer">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                {resume.filename || 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs text-gray-500 mt-1">TXT format (max 5MB)</p>
            </label>
          </div>
          {resume.filename && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span>Uploaded: {resume.filename}</span>
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
            className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
          >
            {showAllGaps ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            {showAllGaps ? 'Hide' : 'Show'} Missing Keywords
          </button>
          <button
            onClick={generateOptimized}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Generate Optimized Resume
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

        <div className="flex gap-4">
          <button
            onClick={downloadResume}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            Download Optimized Resume
          </button>
          <button
            onClick={resetApp}
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