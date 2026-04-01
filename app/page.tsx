'use client';

import { useState, useMemo } from 'react';
import { Search, Loader2, CheckCircle2, XCircle, HelpCircle, GraduationCap, Globe, BookOpen, Plane, Coins, ListChecks, ExternalLink, Filter, ArrowRight, Calendar, MapPin, Building2, Sparkles } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from '@google/genai';

async function generateWithFallback(systemPrompt: string, userPrompt: string) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, userPrompt })
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to generate content");
  }
  
  const data = await res.json();
  return data.text;
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SearchResult {
  id: string;
  name: string;
  university: string;
  country: string;
  deadline: string;
  isFullyFunded: boolean;
  ieltsRequired: boolean | null;
  ieltsWaiverAvailable: boolean;
  benefits: string[];
  url: string;
  summary: string;
}

interface ActionableItem {
  text: string;
  link?: string | null;
}

interface ScholarshipData {
  phdIncluded: boolean | null;
  nigerianEligible: boolean | null;
  ieltsRequired: boolean | null;
  ieltsWaiverAvailable: boolean | null;
  requirements: ActionableItem[];
  benefits: {
    travelFare: boolean | null;
    stipends: boolean | null;
    otherCovers: string[];
  };
  stepByStepGuide: ActionableItem[];
  summary: string;
}

export default function Home() {
  const [mode, setMode] = useState<'search' | 'analyze'>('search');
  
  // Initial Requirements State
  const [reqDegree, setReqDegree] = useState<string[]>([]);
  const [reqField, setReqField] = useState<string[]>([]);
  const [reqLocation, setReqLocation] = useState<string[]>([]);

  // Search State
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  // Filter State
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);
  const [requireIeltsWaiver, setRequireIeltsWaiver] = useState(false);
  const [requireFullyFunded, setRequireFullyFunded] = useState(true);

  // Analyze State
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeData, setAnalyzeData] = useState<ScholarshipData | null>(null);

  // Derived Filters
  const availableCountries = useMemo(() => {
    const countries = new Set<string>();
    searchResults.forEach(r => countries.add(r.country));
    return Array.from(countries).sort();
  }, [searchResults]);

  const availableBenefits = useMemo(() => {
    const benefits = new Set<string>();
    searchResults.forEach(r => r.benefits.forEach(b => benefits.add(b)));
    return Array.from(benefits).sort();
  }, [searchResults]);

  const filteredResults = useMemo(() => {
    return searchResults.filter(res => {
      if (requireFullyFunded && !res.isFullyFunded) return false;
      if (requireIeltsWaiver && res.ieltsRequired && !res.ieltsWaiverAvailable) return false;
      if (selectedCountries.length > 0 && !selectedCountries.includes(res.country)) return false;
      if (selectedBenefits.length > 0) {
        const hasAllBenefits = selectedBenefits.every(selected => 
          res.benefits.some(rb => rb.toLowerCase().includes(selected.toLowerCase()))
        );
        if (!hasAllBenefits) return false;
      }
      return true;
    });
  }, [searchResults, requireFullyFunded, requireIeltsWaiver, selectedCountries, selectedBenefits]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    setIsSearching(true);
    setSearchError(null);

    const reqs = [];
    if (reqDegree.length > 0) reqs.push(`Degree level: ${reqDegree.join(' or ')}`);
    if (reqField.length > 0) reqs.push(`Field of study: ${reqField.join(' or ')}`);
    if (reqLocation.length > 0) reqs.push(`Preferred locations: ${reqLocation.join(' or ')}`);
    
    const reqString = reqs.length > 0 ? ` Specific requirements: ${reqs.join(', ')}.` : '';
    const finalQuery = `Find active scholarships for Williams Alfred Onen.${reqString}`;

    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = new Date().getFullYear();

    try {
      const systemPrompt = `You are an expert scholarship researcher. The current date is ${currentDate}. Return a JSON object with a single key "scholarships" containing an array of 5 to 8 scholarships matching the user's query.
      Each scholarship must have these exact keys:
      - id (string, generate a unique ID)
      - name (string)
      - university (string)
      - country (string)
      - deadline (string, exact date or 'Rolling' or 'Unknown'. MUST be in ${currentYear} or later, strictly after ${currentDate})
      - isFullyFunded (boolean)
      - ieltsRequired (boolean or null)
      - ieltsWaiverAvailable (boolean)
      - benefits (array of strings)
      - url (string, MUST be the EXACT, OFFICIAL direct URL to the scholarship application or details page. DO NOT hallucinate or guess URLs. DO NOT return Google search links. If you do not know the exact official URL, DO NOT include that scholarship in your response at all.)
      - summary (string)
      
      Output ONLY valid JSON. Do not include markdown formatting like \`\`\`json.`;

      const userPrompt = `Find CURRENT, NON-EXPIRED scholarships matching this query: "${finalQuery}".
      The current year is ${currentYear}. DO NOT return any scholarships that expired in 2024, 2025, or any date before ${currentDate}.
      Focus heavily on fully funded opportunities. 
      Provide highly accurate, direct links to well-known, recurring fully-funded scholarships (e.g., Chevening, Erasmus Mundus, DAAD, Gates Cambridge, Fulbright, specific university merit scholarships) that are currently open or opening soon in ${currentYear}.
      If the user mentions they are Nigerian, specifically check if Nigerians are eligible and if an IELTS waiver is possible.`;

      const responseText = await generateWithFallback(systemPrompt, userPrompt);
      
      // Clean up potential markdown from models that ignore the instruction
      const cleanedText = responseText?.replace(/```json/g, '').replace(/```/g, '').trim() || '{}';
      const parsed = JSON.parse(cleanedText);
      setSearchResults(parsed.scholarships || []);
      
      // Reset filters on new search
      setSelectedCountries([]);
      setSelectedBenefits([]);
    } catch (err: any) {
      console.error(err);
      setSearchError(err.message || 'Failed to search for scholarships.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAnalyzeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    analyzeScholarship(url);
  };

  const analyzeScholarship = async (urlToAnalyze: string) => {
    if (!urlToAnalyze) return;
    
    setMode('analyze');
    setUrl(urlToAnalyze);
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeData(null);

    try {
      let urlContent = "";
      try {
        const res = await fetch('/api/fetch', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlToAnalyze }) 
        });
        const data = await res.json();
        urlContent = data.text || "";
      } catch (e) {
        console.warn("Could not fetch URL content directly");
      }

      const systemPrompt = `You are an expert scholarship analyzer. Return a JSON object with the following exact keys analyzing the provided text/URL:
      - phdIncluded (boolean or null)
      - nigerianEligible (boolean or null)
      - ieltsRequired (boolean or null)
      - ieltsWaiverAvailable (boolean or null)
      - requirements (array of objects with "text" and optional "link" strings)
      - benefits (object with "travelFare" (boolean), "stipends" (boolean), and "otherCovers" (array of strings))
      - stepByStepGuide (array of objects with "text" and optional "link" strings)
      - summary (string)
      
      Output ONLY valid JSON. Do not include markdown formatting like \`\`\`json.`;

      const userPrompt = `Analyze this scholarship URL: ${urlToAnalyze}\n\nWebsite Content (if available):\n${urlContent.substring(0, 10000)}\n\nExtract the requested information. Pay special attention to IELTS waivers for Nigerians and exact benefits.`;

      const responseText = await generateWithFallback(systemPrompt, userPrompt);
      
      const cleanedText = responseText?.replace(/```json/g, '').replace(/```/g, '').trim() || '{}';
      setAnalyzeData(JSON.parse(cleanedText));
    } catch (err: any) {
      console.error(err);
      setAnalyzeError(err.message || 'An unexpected error occurred while analyzing the scholarship.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const BooleanIcon = ({ value }: { value: boolean | null }) => {
    if (value === true) return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (value === false) return <XCircle className="w-5 h-5 text-red-500" />;
    return <HelpCircle className="w-5 h-5 text-gray-400" />;
  };

  const toggleFilter = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      {/* Header & Navigation */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="font-display font-bold text-xl text-gray-900 tracking-tight">FindMyScholarship</span>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setMode('search')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                mode === 'search' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Search
            </button>
            <button
              onClick={() => setMode('analyze')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                mode === 'analyze' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Deep Analyze URL
            </button>
          </div>
        </div>
      </header>

      {mode === 'search' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Search Hero */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-10 mb-8 text-center">
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 mb-4">
              FindMyScholarship
            </h1>
            <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
              Powered by advanced AI. We search for active, fully funded scholarships matching your exact profile.
            </p>
            
            <div className="max-w-4xl mx-auto text-left mb-8 bg-gray-50 p-6 rounded-xl border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Optional Requirements</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Degree */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Degree Level</h4>
                  <div className="space-y-2">
                    {['Bachelors', 'Masters', 'PhD', 'Postdoc'].map(deg => (
                      <label key={deg} className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded group-hover:border-blue-500 transition-colors">
                          <input type="checkbox" className="peer sr-only" checked={reqDegree.includes(deg)} onChange={() => toggleFilter(setReqDegree, deg)} />
                          <CheckCircle2 className={cn("w-4 h-4 text-blue-600 absolute opacity-0 transition-opacity", reqDegree.includes(deg) && "opacity-100")} />
                        </div>
                        <span className="text-sm text-gray-700">{deg}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Field */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Field of Study</h4>
                  <div className="space-y-2">
                    {['Computer Science', 'Engineering', 'Business', 'Medicine', 'Arts & Humanities', 'Social Sciences'].map(field => (
                      <label key={field} className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded group-hover:border-blue-500 transition-colors">
                          <input type="checkbox" className="peer sr-only" checked={reqField.includes(field)} onChange={() => toggleFilter(setReqField, field)} />
                          <CheckCircle2 className={cn("w-4 h-4 text-blue-600 absolute opacity-0 transition-opacity", reqField.includes(field) && "opacity-100")} />
                        </div>
                        <span className="text-sm text-gray-700">{field}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Location */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Preferred Location</h4>
                  <div className="space-y-2">
                    {['USA', 'UK', 'Canada', 'Europe', 'Australia', 'Asia'].map(loc => (
                      <label key={loc} className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded group-hover:border-blue-500 transition-colors">
                          <input type="checkbox" className="peer sr-only" checked={reqLocation.includes(loc)} onChange={() => toggleFilter(setReqLocation, loc)} />
                          <CheckCircle2 className={cn("w-4 h-4 text-blue-600 absolute opacity-0 transition-opacity", reqLocation.includes(loc) && "opacity-100")} />
                        </div>
                        <span className="text-sm text-gray-700">{loc}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => handleSearch()}
                disabled={isSearching}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-medium rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[300px] shadow-lg hover:shadow-xl"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin mr-3" />
                    Finding Scholarships...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-6 h-6 mr-3" />
                    Find Scholarship Opportunities
                  </>
                )}
              </button>
            </div>
          </div>

          {searchError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-3 mb-8">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{searchError}</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Filters Sidebar */}
              <div className="w-full lg:w-64 shrink-0 space-y-6">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm sticky top-24">
                  <h3 className="font-display font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Filter className="w-4 h-4" /> Filters
                  </h3>
                  
                  <div className="space-y-5">
                    {/* Quick Toggles */}
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded group-hover:border-blue-500 transition-colors">
                          <input type="checkbox" className="peer sr-only" checked={requireFullyFunded} onChange={(e) => setRequireFullyFunded(e.target.checked)} />
                          <CheckCircle2 className={cn("w-4 h-4 text-blue-600 absolute opacity-0 transition-opacity", requireFullyFunded && "opacity-100")} />
                        </div>
                        <span className="text-sm text-gray-700 font-medium">Fully Funded Only</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded group-hover:border-blue-500 transition-colors">
                          <input type="checkbox" className="peer sr-only" checked={requireIeltsWaiver} onChange={(e) => setRequireIeltsWaiver(e.target.checked)} />
                          <CheckCircle2 className={cn("w-4 h-4 text-blue-600 absolute opacity-0 transition-opacity", requireIeltsWaiver && "opacity-100")} />
                        </div>
                        <span className="text-sm text-gray-700 font-medium">IELTS Waiver Available</span>
                      </label>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Countries */}
                    {availableCountries.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Country</h4>
                        <div className="space-y-2">
                          {availableCountries.map(country => (
                            <label key={country} className="flex items-center gap-3 cursor-pointer group">
                              <div className="relative flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded group-hover:border-blue-500 transition-colors">
                                <input type="checkbox" className="peer sr-only" checked={selectedCountries.includes(country)} onChange={() => toggleFilter(setSelectedCountries, country)} />
                                <CheckCircle2 className={cn("w-4 h-4 text-blue-600 absolute opacity-0 transition-opacity", selectedCountries.includes(country) && "opacity-100")} />
                              </div>
                              <span className="text-sm text-gray-700">{country}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Benefits */}
                    {availableBenefits.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Benefits Included</h4>
                        <div className="space-y-2">
                          {availableBenefits.map(benefit => (
                            <label key={benefit} className="flex items-center gap-3 cursor-pointer group">
                              <div className="relative flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded group-hover:border-blue-500 transition-colors">
                                <input type="checkbox" className="peer sr-only" checked={selectedBenefits.includes(benefit)} onChange={() => toggleFilter(setSelectedBenefits, benefit)} />
                                <CheckCircle2 className={cn("w-4 h-4 text-blue-600 absolute opacity-0 transition-opacity", selectedBenefits.includes(benefit) && "opacity-100")} />
                              </div>
                              <span className="text-sm text-gray-700">{benefit}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Results Grid */}
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-medium text-gray-900">Found {filteredResults.length} scholarships</h2>
                </div>
                
                {filteredResults.length === 0 ? (
                  <div className="bg-white p-10 rounded-2xl border border-gray-200 text-center">
                    <p className="text-gray-500">No scholarships match your current filters. Try adjusting them.</p>
                  </div>
                ) : (
                  filteredResults.map(res => (
                    <div key={res.id} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-xl font-display font-bold text-gray-900 mb-1">{res.name}</h3>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                            <span className="flex items-center gap-1"><Building2 className="w-4 h-4" /> {res.university}</span>
                            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {res.country}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          {res.isFullyFunded && <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Fully Funded</span>}
                          {res.ieltsWaiverAvailable && <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">IELTS Waiver</span>}
                        </div>
                      </div>
                      
                      <div className="mb-5 inline-flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-sm">
                        <Calendar className="w-5 h-5" />
                        <span className="font-bold text-sm tracking-wide uppercase">Application Closes: {res.deadline}</span>
                      </div>
                      
                      <p className="text-gray-700 text-sm mb-5 line-clamp-2">{res.summary}</p>
                      
                      <div className="flex flex-wrap gap-2 mb-6">
                        {res.benefits.map((b, i) => (
                          <span key={i} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">{b}</span>
                        ))}
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-gray-100">
                        <a 
                          href={res.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-full sm:w-auto px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          Visit Website <ExternalLink className="w-4 h-4" />
                        </a>
                        <button 
                          onClick={() => analyzeScholarship(res.url)}
                          className="w-full sm:w-auto px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          Deep Analyze <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'analyze' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-10 mb-8">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 mb-2">
              Deep URL Analysis
            </h1>
            <p className="text-gray-600 mb-6">
              Paste a specific scholarship URL to extract requirements, eligibility, benefits, and get an ELI10 step-by-step guide.
            </p>
            <form onSubmit={handleAnalyzeSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/scholarship"
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none text-gray-900"
                />
              </div>
              <button
                type="submit"
                disabled={isAnalyzing}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px]"
              >
                {isAnalyzing ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Analyzing...</>
                ) : (
                  'Analyze URL'
                )}
              </button>
            </form>
          </div>

          {analyzeError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-3 mb-8">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{analyzeError}</p>
            </div>
          )}

          {analyzeData && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Summary Card */}
              <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-display font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  Scholarship Summary
                </h2>
                <p className="text-gray-700 leading-relaxed">{analyzeData.summary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Quick Facts */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 md:col-span-1">
                  <h3 className="text-lg font-display font-bold text-gray-900 mb-6">Quick Facts</h3>
                  <ul className="space-y-4">
                    <li className="flex items-center justify-between">
                      <span className="text-gray-600">PhD Included</span>
                      <BooleanIcon value={analyzeData.phdIncluded} />
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-gray-600">Nigerian Eligible</span>
                      <BooleanIcon value={analyzeData.nigerianEligible} />
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-gray-600">IELTS Required</span>
                      <BooleanIcon value={analyzeData.ieltsRequired} />
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-gray-600">IELTS Waiver</span>
                      <BooleanIcon value={analyzeData.ieltsWaiverAvailable} />
                    </li>
                  </ul>

                  <div className="mt-8 pt-6 border-t border-gray-100">
                    <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Coins className="w-4 h-4 text-yellow-500" />
                      Benefits
                    </h4>
                    <ul className="space-y-3">
                      <li className="flex items-center gap-3">
                        <BooleanIcon value={analyzeData.benefits.travelFare} />
                        <span className="text-sm text-gray-700">Travel Fare</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <BooleanIcon value={analyzeData.benefits.stipends} />
                        <span className="text-sm text-gray-700">Stipends</span>
                      </li>
                      {(analyzeData.benefits?.otherCovers || []).map((cover, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                          <span className="text-sm text-gray-700">{cover}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Requirements & Guide */}
                <div className="md:col-span-2 space-y-6">
                  
                  {/* Requirements */}
                  <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-display font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <ListChecks className="w-5 h-5 text-blue-600" />
                      What You Need Before Applying
                    </h3>
                    <ul className="space-y-3">
                      {(analyzeData.requirements || []).map((req, i) => {
                        const text = typeof req === 'string' ? req : req.text;
                        const link = typeof req === 'object' ? req.link : null;
                        return (
                          <li key={i} className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                            <span className="text-gray-700">
                              {text}
                              {link && (
                                <a href={link} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 font-medium">
                                  Get it here <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </span>
                          </li>
                        );
                      })}
                      {(!analyzeData.requirements || analyzeData.requirements.length === 0) && (
                        <p className="text-gray-500 italic">No specific requirements found.</p>
                      )}
                    </ul>
                  </div>

                  {/* Step by Step Guide */}
                  <div className="bg-blue-50 p-6 sm:p-8 rounded-2xl border border-blue-100">
                    <h3 className="text-lg font-display font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <Globe className="w-5 h-5 text-blue-600" />
                      How to Apply (Explained Simply)
                    </h3>
                    <p className="text-sm text-blue-600/80 mb-6">Step-by-step guide explained like you're 10 years old.</p>
                    
                    <div className="space-y-6">
                      {(analyzeData.stepByStepGuide || []).map((step, i) => {
                        const text = typeof step === 'string' ? step : step.text;
                        const link = typeof step === 'object' ? step.link : null;
                        return (
                          <div key={i} className="flex gap-4">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                              {i + 1}
                            </div>
                            <div className="pt-1">
                              <p className="text-gray-800 leading-relaxed">
                                {text}
                                {link && (
                                  <a href={link} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 font-medium">
                                    Action Link <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      {(!analyzeData.stepByStepGuide || analyzeData.stepByStepGuide.length === 0) && (
                        <p className="text-gray-500 italic">Could not generate a step-by-step guide.</p>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
