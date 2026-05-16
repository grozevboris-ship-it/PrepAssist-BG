import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Diamond, History, Zap, Book, Shield, RotateCcw, Download, Github, LogOut, CheckCircle2 } from 'lucide-react';

interface GemData {
  name: string;
  description: string;
  properties: string[];
  rarity: string;
  lore: string;
  color: string;
  imageUrl?: string;
}

interface GithubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export default function App() {
  const [description, setDescription] = useState("");
  const [gem, setGem] = useState<GemData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [vault, setVault] = useState<GemData[]>([]);
  const [activeTab, setActiveTab] = useState<'forge' | 'vault'>('forge');
  const [githubUser, setGithubUser] = useState<GithubUser | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('gem_vault');
    if (saved) setVault(JSON.parse(saved));
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
      const authWindow = window.open(url, 'github_oauth', 'width=600,height=700');
      if (!authWindow) {
        alert("Please allow popups to connect to GitHub");
      }
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

  const forgeGem = async () => {
    setIsLoading(true);
    setGem(null);
    try {
      const res = await fetch("/api/gem/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      setGem(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateImage = async () => {
    if (!gem) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/gem/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemData: gem }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        const updatedGem = { ...gem, imageUrl: data.imageUrl };
        setGem(updatedGem);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const addToVault = () => {
    if (gem) {
      const newVault = [gem, ...vault];
      setVault(newVault);
      localStorage.setItem('gem_vault', JSON.stringify(newVault));
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#d4d4d4] font-sans selection:bg-rose-500 selection:text-white">
      {/* Navigation */}
      <nav className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#111111] sticky top-0 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('forge')}>
          <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-rose-700 rounded-lg flex items-center justify-center shadow-lg shadow-rose-900/20">
            <Diamond size={18} className="text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">PrepAssist <span className="text-rose-500 opacity-80 italic font-normal ml-0.5">BG</span></span>
        </div>
        <div className="flex gap-8 text-sm font-medium">
          <button 
            onClick={() => setActiveTab('forge')}
            className={`transition-all pb-5 pt-5 border-b-2 ${activeTab === 'forge' ? 'text-white border-rose-500' : 'text-gray-500 border-transparent hover:text-white'}`}
          >
            Constructor
          </button>
          <button 
            onClick={() => setActiveTab('vault')}
            className={`transition-all pb-5 pt-5 border-b-2 ${activeTab === 'vault' ? 'text-white border-rose-500' : 'text-gray-500 border-transparent hover:text-white'}`}
          >
            Vault ({vault.length})
          </button>
        </div>
        <div className="w-8 h-8 rounded-full bg-[#222] border border-white/10 hidden md:block"></div>
      </nav>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#0d0d0d]">
        <AnimatePresence mode="wait">
          {activeTab === 'forge' ? (
            <motion.div 
              key="forge"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col md:flex-row min-h-[calc(100vh-64px)]"
            >
              {/* Sidebar Settings */}
              <aside className="w-full md:w-80 border-r border-white/5 bg-[#0e0e0e] flex flex-col p-6 space-y-8">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-rose-500 mb-6">Manifestation Parameters</h2>
                  <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Base Essence</label>
                      <textarea 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Heart of a supernova..."
                        className="w-full bg-transparent border-b border-white/20 py-3 text-sm focus:outline-none focus:border-rose-500 text-white placeholder-white/5 resize-none h-32 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <button 
                    onClick={forgeGem}
                    disabled={isLoading}
                    className="w-full py-4 bg-white text-black font-bold rounded-md hover:bg-rose-500 hover:text-white transition-all shadow-xl active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? "Forging..." : "Initialize Gem"}
                    <Sparkles size={14} />
                  </button>
                  
                  {gem && !gem.imageUrl && (
                    <button 
                      onClick={generateImage}
                      disabled={isLoading}
                      className="w-full py-4 border border-rose-500/30 text-rose-500 text-xs font-bold rounded-md hover:bg-rose-500/10 transition-all flex items-center justify-center gap-2"
                    >
                      Manifest Visual
                    </button>
                  )}
                </div>

                <div className="mt-auto pt-6 border-t border-white/5 space-y-4">
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 text-xs text-rose-300 leading-relaxed font-light">
                    GemForge AI utilizes high-fidelity crystallization engines to ensure maximum rarity and magical yield.
                  </div>

                  {githubUser ? (
                    <div className="space-y-2">
                      <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <img src={githubUser.avatar_url} className="w-8 h-8 rounded-full border border-white/20" alt="" />
                          <div>
                            <p className="text-[10px] font-bold text-white uppercase tracking-wider">{githubUser.login}</p>
                            <p className="text-[9px] text-emerald-500 flex items-center gap-1"><CheckCircle2 size={10} /> Synched</p>
                          </div>
                        </div>
                        <button onClick={handleLogout} className="text-gray-500 hover:text-rose-500 transition-colors">
                          <LogOut size={14} />
                        </button>
                      </div>
                      <button 
                        onClick={handleSyncToGithub}
                        disabled={isLoading}
                        className="w-full py-2 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all disabled:opacity-30"
                      >
                        Push Code to GitHub
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={handleGithubConnect}
                      className="w-full py-3 bg-[#111] hover:bg-[#1a1a1a] border border-white/10 rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                    >
                      <Github size={14} />
                      Synch with GitHub
                    </button>
                  )}
                </div>
              </aside>

              {/* Main Preview */}
              <section className="flex-1 p-8 md:p-16 flex items-center justify-center relative bg-[#0d0d0d]">
                <AnimatePresence mode="wait">
                  {gem ? (
                    <motion.div 
                      key={gem.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="max-w-4xl w-full grid md:grid-cols-2 gap-12"
                    >
                      <div className="space-y-8">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-500 text-[10px] uppercase font-bold tracking-widest border border-rose-500/20">
                              {gem.rarity}
                            </span>
                            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Spectral Class A-1</span>
                          </div>
                          <h1 className="text-5xl font-light text-white tracking-tight leading-none mb-4">{gem.name}</h1>
                          <p className="text-gray-500 text-sm leading-relaxed">{gem.description}</p>
                        </div>

                        <div className="bg-[#151515] rounded-xl border border-white/5 p-6 space-y-6 shadow-2xl relative overflow-hidden">
                          <div className="flex justify-between items-center bg-white/5 -m-6 p-4 px-6 border-b border-white/5 mb-2">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-white/40">Gemspec Definition</span>
                            <div className="flex gap-2">
                               <button onClick={addToVault} className="text-gray-500 hover:text-rose-500"><History size={14} /></button>
                            </div>
                          </div>
                          
                          <div className="pt-6 space-y-4">
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 opacity-60">Physical Properties</span>
                              <div className="flex flex-wrap gap-2">
                                {gem.properties.map(p => (
                                  <span key={p} className="text-[11px] bg-white/5 px-2 py-1 rounded text-gray-300">{p}</span>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 opacity-60">Ancient Lore</span>
                              <p className="text-xs text-gray-400 leading-relaxed font-mono italic">
                                {gem.lore}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="relative group">
                        <div className="aspect-square bg-[#151515] rounded-2xl border border-white/5 overflow-hidden shadow-2xl flex items-center justify-center relative">
                          {gem.imageUrl ? (
                            <img src={gem.imageUrl} alt={gem.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="p-12 text-center space-y-4 opacity-20 group-hover:opacity-40 transition-opacity">
                              <Diamond size={80} style={{ color: gem.color }} />
                              <p className="text-xs uppercase tracking-widest font-medium">Visualizing Resonance...</p>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-6 flex items-end">
                            <span className="text-[10px] text-white/60 tracking-widest uppercase">Crystallized at 8K • 1.0.4v</span>
                          </div>
                        </div>
                        {/* Status Dots */}
                        <div className="absolute -top-3 -right-3 flex gap-2">
                           <div className="w-3 h-3 rounded-full bg-rose-500 shadow-lg shadow-rose-500/40"></div>
                           <div className="w-3 h-3 rounded-full bg-[#222]"></div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center space-y-4 opacity-20">
                      <div className="w-16 h-16 border border-white/10 rounded-full flex items-center justify-center">
                        <Diamond size={32} />
                      </div>
                      <p className="text-xs uppercase tracking-[0.4em] font-light">Awaiting input parameters</p>
                    </div>
                  )}
                </AnimatePresence>
              </section>
            </motion.div>
          ) : (
            <motion.div 
              key="vault"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 p-12 max-w-6xl mx-auto w-full space-y-12"
            >
              <div className="flex justify-between items-end">
                <div>
                   <h1 className="text-4xl font-light text-white tracking-tight">Crystallization Vault</h1>
                   <p className="text-gray-500 text-sm mt-2">Historical registry of all artifacts manifested within this session.</p>
                </div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest border border-white/10 px-3 py-1.5 rounded">
                  Records: {vault.length}
                </div>
              </div>

              {vault.length === 0 ? (
                <div className="h-64 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center opacity-30 space-y-4 font-light">
                  <History size={32} />
                  <p className="text-xs uppercase tracking-widest">Registry Empty</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {vault.map((v, i) => (
                    <motion.div 
                      key={i}
                      whileHover={{ y: -4 }}
                      className="bg-[#151515] border border-white/5 rounded-xl overflow-hidden hover:border-rose-500/30 transition-all group"
                    >
                      <div className="aspect-video relative bg-[#0a0a0a]">
                        {v.imageUrl ? (
                          <img src={v.imageUrl} alt={v.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-10">
                            <Diamond size={48} />
                          </div>
                        )}
                        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[8px] font-bold uppercase text-rose-500 border border-rose-500/20">
                          {v.rarity}
                        </div>
                      </div>
                      <div className="p-5 space-y-3">
                        <h3 className="text-lg font-medium text-white">{v.name}</h3>
                        <p className="text-xs text-gray-500 line-clamp-2 italic font-mono">{v.lore}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Status Bar */}
      <footer className="h-8 bg-[#111111] border-t border-white/5 px-4 flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500 font-bold z-50">
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span> 
            {isLoading ? 'Manifesting Resonance...' : 'Neural Engine Active'}
          </span>
          <span className="hidden md:inline">Precision: 0.9997af</span>
        </div>
        <div className="flex gap-6">
          <span>UTF-8</span>
          <span>Prep ID: PA-08221</span>
        </div>
      </footer>
    </div>
  );
}
