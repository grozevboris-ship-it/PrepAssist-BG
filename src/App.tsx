import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Presentation, 
  History, 
  Zap, 
  Target, 
  AlertTriangle, 
  ListTodo, 
  MessageSquare,
  Github, 
  LogOut, 
  CheckCircle2,
  Upload,
  Diamond,
  X,
  FileCheck,
  ChevronRight,
  Download,
  LayoutDashboard,
  BarChart3,
  Settings as SettingsIcon,
  Search,
  Bell,
  HelpCircle,
  Plus,
  FileDown,
  Monitor,
  Quote,
  Cpu
} from 'lucide-react';

interface MeetingReport {
  summary: string;
  risks: string[];
  talking_points: string[];
  next_steps: string[];
  cover_image_prompt: string;
  imageUrl?: string;
  title?: string;
}

interface GithubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export default function App() {
  const [notesFile, setNotesFile] = useState<File | null>(null);
  const [slidesFile, setSlidesFile] = useState<File | null>(null);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [selectedModel, setSelectedModel] = useState<'gemini-3-flash-preview' | 'gemini-3.1-pro-preview'>('gemini-3-flash-preview');
  const [report, setReport] = useState<MeetingReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [archive, setArchive] = useState<MeetingReport[]>([]);
  const [githubUser, setGithubUser] = useState<GithubUser | null>(null);

  const notesInputRef = useRef<HTMLInputElement>(null);
  const slidesInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('meeting_archive');
    if (saved) setArchive(JSON.parse(saved));
    fetchGithubUser();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchGithubUser();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchGithubUser = async () => {
    try {
      const res = await fetch("/api/auth/user");
      if (!res.ok) {
        console.warn("Failed to fetch user, status:", res.status);
        return;
      }
      const data = await res.json();
      setGithubUser(data.user);
    } catch (err) {
      console.error("Failed to fetch GitHub user:", err);
    }
  };

  const handleGithubConnect = async () => {
    try {
      const res = await fetch("/api/auth/github/url");
      const { url } = await res.json();
      window.open(url, 'github_oauth', 'width=600,height=700');
    } catch (err) {
      console.error("GitHub connect error:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setGithubUser(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleSyncToGithub = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/github/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert("Succesfully pushed to GitHub: " + data.url);
      } else {
        alert("Failed to sync: " + data.error);
      }
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const prepareMeeting = async () => {
    if (!notesFile && !slidesFile && !additionalNotes) return;
    setIsLoading(true);
    setReport(null);

    const formData = new FormData();
    if (notesFile) formData.append('notes', notesFile);
    if (slidesFile) formData.append('slides', slidesFile);
    if (additionalNotes) formData.append('additionalNotes', additionalNotes);
    formData.append('model', selectedModel);

    try {
      const res = await fetch("/api/meeting/prepare", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || "Unknown server error" };
        }
        throw new Error(errorData.error || "Failed to analyze materials");
      }

      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "An unexpected error occurred during synthesis.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateImage = async () => {
    if (!report) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/meeting/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          imagePrompt: report.cover_image_prompt, 
          title: report.summary.substring(0, 30),
          model: selectedModel 
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || "Unknown server error" };
        }
        throw new Error(errorData.error || "Failed to generate image");
      }

      const data = await res.json();
      if (data.imageUrl) {
        setReport({ ...report, imageUrl: data.imageUrl });
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "An unexpected error occurred during image generation.");
    } finally {
      setIsLoading(false);
    }
  };

  const addToArchive = () => {
    if (report) {
      const newArchive = [report, ...archive];
      setArchive(newArchive);
      localStorage.setItem('meeting_archive', JSON.stringify(newArchive));
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#d4d4d4] font-sans selection:bg-brand-primary selection:text-white flex overflow-hidden">
      
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r border-[#1f1f23] bg-[#0a0a0a] z-50">
        <div className="p-8">
          <div className="space-y-1">
             <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
               Prep Assist <span className="text-brand-primary italic font-normal">BG</span>
             </h1>
             <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Analytical Intelligence</p>
          </div>
        </div>

        <div className="flex-1"></div>

        {githubUser ? (
          <div className="p-6 border-t border-[#1f1f23] flex items-center gap-4">
            <img src={githubUser.avatar_url} className="w-10 h-10 rounded-lg border border-white/10" alt="" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{githubUser.login}</p>
              <p className="text-[10px] text-gray-500">Authorized</p>
            </div>
            <button key="logout-btn" onClick={handleLogout} className="text-gray-500 hover:text-red-500 transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="p-6 border-t border-[#1f1f23]">
             <button 
              key="github-connect-btn"
              onClick={handleGithubConnect}
              className="w-full py-3 bg-[#111] hover:bg-brand-primary/10 border border-brand-primary/30 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all text-brand-primary"
             >
               <Github size={14} /> Secure Link
             </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* Header Bar */}
        <header className="h-16 border-b border-[#1f1f23] flex items-center justify-between px-8 bg-[#0a0a0a]">
           <div className="flex items-center gap-4 flex-1">
             <div className="relative max-w-sm w-full hidden md:block">
               <Search className="absolute left-3 top-1/2 -track-y-1/2 text-gray-600" size={14} />
               <input 
                type="text" 
                placeholder="Search insights..." 
                className="w-full bg-[#121217] border border-[#1f1f23] rounded-lg py-2 pl-10 pr-4 text-xs focus:outline-none focus:border-brand-primary/30 text-gray-300"
               />
             </div>
           </div>
           <div className="flex items-center gap-6">
             <div className="flex gap-4 text-gray-500">
               <button className="hover:text-white transition-colors"><Bell size={18} /></button>
               <button className="hover:text-white transition-colors"><HelpCircle size={18} /></button>
             </div>
             <div className="h-4 w-[1px] bg-[#1f1f23]"></div>
             <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Project X Strategy</span>
           </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-12">
            
            {/* Title Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
               <div className="space-y-2">
                 <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">Prep Assist <span className="text-brand-primary italic font-normal">BG</span></h2>
                 <p className="text-sm text-gray-500 font-light max-w-2xl">
                   Synthesized strategic overview for the meeting. Real-time analysis of trajectory and stakeholder sentiment.
                 </p>
               </div>
               <div className="flex items-center gap-3">
                  <button className="px-5 py-2.5 rounded-lg border border-[#1f1f23] text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-all text-gray-400 flex items-center gap-2">
                    <FileDown size={14} /> Export PDF
                  </button>
                  <button className="px-5 py-2.5 rounded-lg bg-brand-primary text-[#121217] text-xs font-bold uppercase tracking-widest hover:bg-brand-primary/90 transition-all flex items-center gap-2">
                    <Monitor size={14} /> Focus Mode
                  </button>
               </div>
            </div>

            {!report ? (
              <div className="grid lg:grid-cols-3 gap-8">
                 <div className="lg:col-span-1 space-y-8">
                    <div className="glass-card p-8 space-y-6">
                       <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-[#818cf8]">Intelligence Parameters</h3>
                          <div className="flex bg-[#0a0a0a] rounded-lg p-1 border border-[#1f1f23]">
                             <button 
                              onClick={() => setSelectedModel('gemini-3-flash-preview')}
                              className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all ${selectedModel === 'gemini-3-flash-preview' ? 'bg-brand-primary text-[#121217]' : 'text-gray-500 hover:text-white'}`}
                             >
                               Flash
                             </button>
                             <button 
                              onClick={() => setSelectedModel('gemini-3.1-pro-preview')}
                              className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all ${selectedModel === 'gemini-3.1-pro-preview' ? 'bg-brand-primary text-[#121217]' : 'text-gray-500 hover:text-white'}`}
                             >
                               Pro
                             </button>
                          </div>
                       </div>

                       <div className="bg-white/5 border border-white/5 rounded-lg p-3 space-y-1.5">
                          <p className="text-[10px] text-gray-400 leading-relaxed italic">
                            <span className="text-brand-primary font-bold">Flash:</span> Optimized for speed and rapid output synthesis.
                          </p>
                          <p className="text-[10px] text-gray-400 leading-relaxed italic">
                            <span className="text-brand-primary font-bold">Pro:</span> Optimized for deep strategic insight and nuanced content.
                          </p>
                       </div>
                       
                       <div className="space-y-4">
                          <div className="space-y-2">
                             <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Manual Notes / Context</label>
                             <textarea 
                              value={additionalNotes}
                              onChange={(e) => setAdditionalNotes(e.target.value)}
                              placeholder="Paste meeting transcript or additional context here..."
                              className="w-full bg-[#16161c] border border-[#1f1f23] rounded-lg p-4 text-xs text-gray-300 focus:outline-none focus:border-brand-primary/30 min-h-[120px] resize-none custom-scrollbar"
                             />
                          </div>

                          <button 
                            onClick={() => notesInputRef.current?.click()}
                            className="w-full glass-card p-6 flex flex-col items-center gap-3 hover:border-brand-primary/30 transition-all group bg-[#16161c]"
                          >
                            <FileText size={24} className="text-gray-500 group-hover:text-brand-primary transition-colors" />
                            <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{notesFile ? notesFile.name : "Attach Report (PDF/PPT/Images)"}</span>
                          </button>
                          <input 
                            ref={notesInputRef} 
                            type="file" 
                            accept=".pdf,image/*,.ppt,.pptx"
                            className="hidden" 
                            onChange={(e) => setNotesFile(e.target.files?.[0] || null)} 
                          />

                          <button 
                            onClick={() => slidesInputRef.current?.click()}
                            className="w-full glass-card p-6 flex flex-col items-center gap-3 hover:border-brand-primary/30 transition-all group bg-[#16161c]"
                          >
                            <Presentation size={24} className="text-gray-500 group-hover:text-brand-primary transition-colors" />
                            <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{slidesFile ? slidesFile.name : "Attach Slides (PDF/PPT/Images)"}</span>
                          </button>
                          <input 
                            ref={slidesInputRef} 
                            type="file" 
                            accept=".pdf,image/*,.ppt,.pptx"
                            className="hidden" 
                            onChange={(e) => setSlidesFile(e.target.files?.[0] || null)} 
                          />
                       </div>

                       <button 
                        onClick={prepareMeeting}
                        disabled={isLoading || (!notesFile && !slidesFile && !additionalNotes)}
                        className="w-full py-4 bg-white text-black font-bold rounded-lg hover:bg-brand-primary hover:text-white transition-all shadow-xl disabled:opacity-20 flex items-center justify-center gap-2"
                       >
                         {isLoading ? "Synthesizing..." : "Initiate Analysis"}
                         <Zap size={16} />
                       </button>
                    </div>
                 </div>

                 <div className="lg:col-span-2 glass-card h-[500px] flex items-center justify-center relative overflow-hidden bg-[#0d0d12]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand-primary/10 via-transparent to-transparent opacity-50"></div>
                    <div className="text-center space-y-4 relative z-10 opacity-20">
                       <Diamond size={64} className="mx-auto" />
                       <p className="text-[10px] uppercase tracking-[0.4em] font-medium">Awaiting Data Streams</p>
                    </div>
                 </div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                {/* Dashboard Grid */}
                <div className="grid lg:grid-cols-12 gap-8">
                  
                  {/* Connectivity Map / Hero */}
                  <div className="lg:col-span-12 glass-card relative bg-[#0d0d12] h-[550px]">
                    {report.imageUrl ? (
                      <img src={report.imageUrl} className="w-full h-full object-cover opacity-80" alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-center p-12 space-y-6">
                        <div className="relative">
                          <div className="absolute inset-0 bg-brand-primary/20 blur-3xl rounded-full"></div>
                          <Target size={80} className="text-brand-primary relative z-10 animate-pulse" />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-brand-primary">Visual Synthesis Pending</p>
                           <button 
                            onClick={generateImage}
                            className="px-6 py-2.5 rounded-lg border border-brand-primary/30 text-brand-primary text-[10px] font-bold uppercase tracking-widest hover:bg-brand-primary hover:text-white transition-all mt-4"
                           >Manifest Visualization</button>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-10 left-10 space-y-2 z-20">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-white/10 text-white text-[8px] font-bold uppercase tracking-widest">AI Visual Synthesis</span>
                        <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">Last updated 2m ago</span>
                      </div>
                      <h3 className="text-4xl font-bold text-white tracking-tight">Stakeholder Connectivity Map</h3>
                    </div>
                  </div>
                </div>

                {/* Second Row: Detailed Breakdown */}
                <div className="grid lg:grid-cols-2 gap-8">
                   {/* Executive Summary */}
                   <div className="glass-card p-10 space-y-10">
                      <div className="flex items-center gap-4">
                        <div className="h-6 w-1 bg-brand-primary"></div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">Executive Summary</h2>
                      </div>
                      
                      <div className="space-y-8">
                        <p className="text-lg text-gray-300 font-light leading-relaxed">
                          {report.summary}
                        </p>

                        <div className="glass-card bg-white/5 p-8 space-y-6">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#818cf8] flex items-center gap-2">
                             <Zap size={14} /> Keyword Highlights
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {["Strategic Alignment", "Risk Mitigation", "Infrastructure", "Compliance", "Fiscal Control"].map(tag => (
                              <span key={tag} className="px-3 py-1.5 rounded-lg border border-[#1f1f23] bg-[#0a0a0a] text-[10px] font-medium text-gray-400 capitalize">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-start gap-4 p-6 border-l-2 border-status-critical bg-status-critical/5 rounded-r-xl">
                          <AlertTriangle size={20} className="text-status-critical mt-1 flex-shrink-0" />
                          <div className="space-y-1">
                             <h4 className="text-xs font-bold text-white uppercase tracking-widest">Critical Insight</h4>
                             <p className="text-sm text-gray-400 italic">Immediate reallocation is advised before the final strategy sign-off.</p>
                          </div>
                        </div>
                      </div>
                   </div>

                   {/* Right Column: Next Steps & Actions */}
                   <div className="space-y-8">
                     {/* Next Steps */}
                     <div className="space-y-4">
                       <h3 className="text-xs font-bold uppercase tracking-widest text-[#818cf8] flex items-center gap-2">
                          <ListTodo size={14} /> Next Steps
                       </h3>
                       <div className="space-y-3">
                          {report.next_steps.map((step, i) => (
                            <div key={i} className="glass-card p-4 border-l-4 border-l-brand-primary bg-white/5">
                               <p className="text-sm text-gray-300 font-light">
                                 {step}
                               </p>
                            </div>
                          ))}
                       </div>
                     </div>

                     {/* Export Tools */}
                     <div className="flex gap-4">
                        <button 
                          onClick={addToArchive}
                          className="flex-1 py-4 glass-card border-brand-primary/20 hover:bg-brand-primary/5 transition-all flex items-center justify-center gap-3 text-brand-primary font-bold text-xs uppercase tracking-widest"
                        >
                          <History size={16} /> Save to Archive
                        </button>
                        <button 
                          onClick={() => window.print()}
                          className="flex-1 py-4 glass-card border-white/10 hover:bg-white/5 transition-all flex items-center justify-center gap-3 text-white font-bold text-xs uppercase tracking-widest"
                        >
                          <Download size={16} /> Export Intelligence
                        </button>
                     </div>
                   </div>
                </div>

                {/* Risk Grid Section */}
                <div className="space-y-4">
                   <div className="flex items-center gap-4 mb-8">
                    <AlertTriangle size={24} className="text-status-critical" />
                    <div className="flex-1 flex items-center justify-between">
                       <h2 className="text-3xl font-bold text-white tracking-tight">Risk Identification</h2>
                       <span className="px-4 py-1.5 rounded-full bg-status-critical text-white text-[10px] font-bold uppercase tracking-widest">3 Critical Blockers</span>
                    </div>
                   </div>
                   
                   <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {report.risks.map((risk, i) => (
                        <div key={i} className="glass-card p-8 border-l-4 border-l-status-warning space-y-4 relative group">
                           <div className="flex justify-between items-start">
                             <h4 className="text-lg font-bold text-white leading-tight">Risk {i+1}</h4>
                           </div>
                           <p className="text-sm text-gray-400 font-light leading-relaxed italic">
                             "{risk}"
                           </p>
                        </div>
                      ))}
                   </div>
                </div>

                {/* Talking Points Grid */}
                <div className="space-y-4">
                   <div className="flex items-center gap-4 mb-8">
                    <MessageSquare size={24} className="text-brand-primary" />
                    <h2 className="text-3xl font-bold text-white tracking-tight">Key Talking Points</h2>
                   </div>
                   
                   <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                      {report.talking_points.map((tp, i) => (
                        <div key={i} className="glass-card p-8 bg-[#16161c] border-white/5 space-y-4">
                           <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-primary">Insight {i+1}</span>
                           <p className="text-md text-white font-light leading-relaxed italic">
                             "{tp}"
                           </p>
                        </div>
                      ))}
                   </div>
                </div>

              </motion.div>
            )}
          </div>
        </main>

        {/* Floating Success Notification Placeholder */}
        {isLoading && (
          <div className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-status-success text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-2xl z-50 animate-bounce">
            Processing Neural Streams...
          </div>
        )}

        {/* Desktop Footer Status */}
        <footer className="hidden lg:flex h-10 border-t border-[#1f1f23] bg-[#0a0a0a] items-center justify-between px-8 text-[9px] font-bold uppercase tracking-[0.2em] text-gray-600">
           <div className="flex gap-8">
              <span className="flex items-center gap-2"><CheckCircle2 size={12} className="text-status-success" /> Market Analysis</span>
              <span className="flex items-center gap-2"><CheckCircle2 size={12} className="text-status-success" /> Risk Assessment</span>
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-status-warning" /> Final Synthesis</span>
           </div>
           <div>System Status: <span className="text-status-success">Optimized</span></div>
        </footer>
      </div>
    </div>
  );
}
