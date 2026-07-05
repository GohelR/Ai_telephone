import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  Play,
  Square,
  RotateCcw,
  Download,
  Activity,
  Cpu,
  Clock,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Info,
  ChevronRight,
  Layers,
  ArrowRight,
  Mic,
} from "lucide-react";
import LiveAudio from "./components/LiveAudio";

// SAMPLES: Three custom high-fidelity geometric theme SVGs defined as clean data URIs
const SAMPLES = [
  {
    id: "sample1",
    name: "Cosmic Neon Ring",
    prompt: "A glowing magenta and cyan cosmic ring floating in a deep empty starfield, sleek vector art style",
    url: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="100%" height="100%" fill="#0a0a16"/><circle cx="256" cy="256" r="140" stroke="#ff007f" stroke-width="12" fill="none" opacity="0.8"/><circle cx="256" cy="256" r="120" stroke="#00f3ff" stroke-width="6" fill="none" opacity="0.9"/><circle cx="256" cy="256" r="4" fill="#ffffff" opacity="0.5"/><circle cx="100" cy="150" r="1.5" fill="#ffffff"/><circle cx="400" cy="100" r="2" fill="#ffffff"/><circle cx="380" cy="380" r="1" fill="#ffffff"/><circle cx="150" cy="420" r="2" fill="#ffffff"/></svg>`)
  },
  {
    id: "sample2",
    name: "Zen Monolith",
    prompt: "A mysterious charcoal black monolith standing on dry sand under a gigantic red sun and warm sky",
    url: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="100%" height="100%" fill="#1a120b"/><circle cx="256" cy="180" r="100" fill="#e58e26"/><rect x="236" y="200" width="40" height="200" fill="#020202"/><path d="M0 380 L512 380 L512 512 L0 512 Z" fill="#3c2a21"/><circle cx="80" cy="80" r="1" fill="#ffffff" opacity="0.3"/><circle cx="430" cy="120" r="1.5" fill="#ffffff" opacity="0.4"/></svg>`)
  },
  {
    id: "sample3",
    name: "Synth Grid",
    prompt: "An electric green perspective matrix wireframe grid vanishing into a hot neon pink cyberpunk sunrise",
    url: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="100%" height="100%" fill="#0d0211"/><circle cx="256" cy="200" r="90" fill="#f368e0"/><path d="M 0,300 L 512,300 M 0,330 L 512,330 M 0,370 L 512,370 M 0,420 L 512,420 M 0,480 L 512,480" stroke="#00ff66" stroke-width="2" opacity="0.6"/><path d="M 256,300 L 256,512 M 200,300 L 100,512 M 120,300 L 0,440 M 312,300 L 412,512 M 392,300 L 512,440 M 160,300 L 0,500 M 352,300 L 512,500" stroke="#00ff66" stroke-width="2" opacity="0.6"/></svg>`)
  }
];

interface GenerationStep {
  index: number; // 0 to 10
  imageUrl: string;
  caption: string;
  describeLatency?: number; // ms
  generateLatency?: number; // ms
  totalLatency?: number; // ms
  status: 'idle' | 'generating_caption' | 'generating_image' | 'completed' | 'error';
  error?: string;
}

export default function App() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [steps, setSteps] = useState<GenerationStep[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null); // null = idle, 0 to 10, 11 = finished
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [latencyMonitorOpen, setLatencyMonitorOpen] = useState<boolean>(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [isLiveAudioOpen, setIsLiveAudioOpen] = useState<boolean>(false);
  
  // Ref for auto-scrolling filmstrip
  const filmstripRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats for latency
  const [activeStepStats, setActiveStepStats] = useState<{
    step: number;
    phase: "idle" | "captioning" | "rendering";
    startTime: number;
    elapsed: number;
  } | null>(null);

  const statsIntervalRef = useRef<number | null>(null);

  // Initialize empty steps when original image is selected
  useEffect(() => {
    if (originalImage) {
      const initialSteps: GenerationStep[] = [
        {
          index: 0,
          imageUrl: originalImage,
          caption: "Source Matrix (Gen 0)",
          status: 'completed',
          totalLatency: 0,
        },
        ...Array.from({ length: 10 }, (_, i) => ({
          index: i + 1,
          imageUrl: "",
          caption: "",
          status: 'idle' as const,
        })),
      ];
      setSteps(initialSteps);
      setCurrentIdx(null);
      setIsGenerating(false);
      setErrorStatus(null);
    } else {
      setSteps([]);
    }
  }, [originalImage]);

  // Handle active timers in the active statistics monitor
  useEffect(() => {
    if (isGenerating && activeStepStats) {
      statsIntervalRef.current = window.setInterval(() => {
        setActiveStepStats((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            elapsed: Date.now() - prev.startTime,
          };
        });
      }, 50) as unknown as number;
    } else {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    }
    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [isGenerating, activeStepStats]);

  // Center-crop files to 1:1 square aspect ratio
  const cropToSquare = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;

        ctx.drawImage(img, sx, sy, size, size, 0, 0, 512, 512);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Unable to parse image data."));
      img.src = dataUrl;
    });
  };

  // Image Upload handler
  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const baseData = event.target?.result as string;
        try {
          const squareData = await cropToSquare(baseData);
          setOriginalImage(squareData);
        } catch (err: any) {
          setErrorStatus("Crops failed: " + err.message);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Drop zone drag handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const baseData = event.target?.result as string;
        try {
          const squareData = await cropToSquare(baseData);
          setOriginalImage(squareData);
        } catch (err: any) {
          setErrorStatus("Crops failed: " + err.message);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Run the loop sequence
  const startTelephone = () => {
    if (!originalImage || steps.length === 0) return;
    setIsGenerating(true);
    setIsPaused(false);
    setErrorStatus(null);
    
    // Start from wherever we paused or start from scratch (index 1)
    const nextUnfinishedIdx = steps.findIndex(s => s.index > 0 && s.status !== 'completed');
    const startIdx = nextUnfinishedIdx === -1 ? 1 : nextUnfinishedIdx;
    setCurrentIdx(startIdx);
  };

  // Control loop iteration changes
  useEffect(() => {
    if (!isGenerating || isPaused || currentIdx === null || currentIdx > 10) {
      if (currentIdx === 11) {
        setIsGenerating(false);
        setActiveStepStats(null);
      }
      return;
    }

    let isSubscribed = true;

    const runIteration = async (idx: number) => {
      // 1. Analyze phase (describe)
      if (!isSubscribed) return;
      
      setSteps(prev => prev.map(s => s.index === idx ? { ...s, status: 'generating_caption' } : s));
      setActiveStepStats({
        step: idx,
        phase: "captioning",
        startTime: Date.now(),
        elapsed: 0,
      });

      const describeStartTime = Date.now();
      const sourceImage = steps[idx - 1].imageUrl;

      let caption = "";
      let describeLatency = 0;

      try {
        const describeRes = await fetch("/api/describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: sourceImage }),
        });

        if (!describeRes.ok) {
          const errData = await describeRes.json();
          throw new Error(errData.error || "Failed to analyze frame");
        }

        const describeData = await describeRes.json();
        caption = describeData.caption;
        describeLatency = Date.now() - describeStartTime;

        if (!isSubscribed) return;

        setSteps(prev => prev.map(s => s.index === idx ? { 
          ...s, 
          caption: caption,
          describeLatency: describeLatency,
          status: 'generating_image'
        } : s));

        // Update stats phase to rendering
        setActiveStepStats({
          step: idx,
          phase: "rendering",
          startTime: Date.now(),
          elapsed: 0,
        });

      } catch (err: any) {
        console.error("Describe API Error:", err);
        if (isSubscribed) {
          setErrorStatus(`[GEN ${idx}] Describe error: ${err.message}`);
          setSteps(prev => prev.map(s => s.index === idx ? { ...s, status: 'error', error: err.message } : s));
          setIsGenerating(false);
          setActiveStepStats(null);
        }
        return;
      }

      // 2. Render phase (generate)
      const generateStartTime = Date.now();
      try {
        const generateRes = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: caption }),
        });

        if (!generateRes.ok) {
          const errData = await generateRes.json();
          throw new Error(errData.error || "Failed to render caption to image");
        }

        const generateData = await generateRes.json();
        const outputImage = generateData.image;
        const generateLatency = Date.now() - generateStartTime;
        const totalLatency = describeLatency + generateLatency;

        if (!isSubscribed) return;

        // Auto-scroll the filmstrip container to the active step
        if (filmstripRef.current) {
          const stepElement = filmstripRef.current.children[idx] as HTMLElement;
          if (stepElement) {
            filmstripRef.current.scrollTo({
              left: stepElement.offsetLeft - 80,
              behavior: "smooth"
            });
          }
        }

        setSteps(prev => prev.map(s => s.index === idx ? { 
          ...s, 
          imageUrl: outputImage,
          generateLatency: generateLatency,
          totalLatency: totalLatency,
          status: 'completed'
        } : s));

        // Move to the next index
        setTimeout(() => {
          if (isSubscribed) {
            setCurrentIdx(idx + 1);
          }
        }, 300);

      } catch (err: any) {
        console.error("Generate API Error:", err);
        if (isSubscribed) {
          setErrorStatus(`[GEN ${idx}] Render error: ${err.message}`);
          setSteps(prev => prev.map(s => s.index === idx ? { ...s, status: 'error', error: err.message } : s));
          setIsGenerating(false);
          setActiveStepStats(null);
        }
      }
    };

    runIteration(currentIdx);

    return () => {
      isSubscribed = false;
    };
  }, [isGenerating, isPaused, currentIdx]);

  const pauseTelephone = () => {
    setIsPaused(true);
    setIsGenerating(false);
    setActiveStepStats(null);
  };

  const resetTelephone = () => {
    setOriginalImage(null);
    setSteps([]);
    setCurrentIdx(null);
    setIsGenerating(false);
    setIsPaused(false);
    setErrorStatus(null);
    setActiveStepStats(null);
  };

  // Helper function to load images inside export canvas
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Frame failed to load in memory."));
      img.src = src;
    });
  };

  // Canvas Exporter: stitch generations together as one high-fidelity wide PNG
  const handleDownloadFilmstrip = async () => {
    try {
      const frameWidth = 400;
      const frameHeight = 400;
      const gap = 30;
      const padding = 40;
      const textHeight = 160;
      const headerHeight = 100;
      const totalFrames = steps.length;

      const canvasWidth = padding * 2 + totalFrames * frameWidth + (totalFrames - 1) * gap;
      const canvasHeight = padding * 2 + headerHeight + frameHeight + textHeight;

      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Dark solid space base
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Aesthetic frame border
      ctx.strokeStyle = "#27272a";
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, canvasWidth - 20, canvasHeight - 20);

      // Header Meta Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px 'JetBrains Mono', monospace";
      ctx.fillText("AI TELEPHONE — DECAY MATRIX", padding, padding + 35);
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "14px 'JetBrains Mono', monospace";
      ctx.fillText("MUTATION TRACE: GENERATION 00 (SOURCE) THROUGH 10", padding, padding + 60);

      // Sprocket holes
      ctx.fillStyle = "#18181b";
      const sprocketCount = Math.floor(canvasWidth / 40);
      for (let s = 0; s < sprocketCount; s++) {
        ctx.fillRect(s * 40 + 10, padding + 80, 20, 12);
        ctx.fillRect(s * 40 + 10, canvasHeight - padding - 20, 20, 12);
      }

      // Render frames
      for (let i = 0; i < totalFrames; i++) {
        const step = steps[i];
        const x = padding + i * (frameWidth + gap);
        const y = padding + headerHeight + 20;

        // Frame cell border
        ctx.fillStyle = "#18181b";
        ctx.fillRect(x - 10, y - 10, frameWidth + 20, frameHeight + textHeight + 20);
        ctx.strokeStyle = i === 0 ? "#22c55e" : i === 10 ? "#ef4444" : "#3f3f46";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 10, y - 10, frameWidth + 20, frameHeight + textHeight + 20);

        // Draw Frame Image
        try {
          const img = await loadImage(step.imageUrl);
          ctx.drawImage(img, x, y, frameWidth, frameHeight);
        } catch (err) {
          ctx.fillStyle = "#27272a";
          ctx.fillRect(x, y, frameWidth, frameHeight);
          ctx.fillStyle = "#ef4444";
          ctx.font = "12px monospace";
          ctx.fillText("[Image Missing]", x + 20, y + 50);
        }

        // Labels
        ctx.fillStyle = i === 0 ? "#22c55e" : i === 10 ? "#ef4444" : "#ffaa00";
        ctx.font = "bold 16px 'JetBrains Mono', monospace";
        const genNum = String(i).padStart(2, "0");
        const label = i === 0 ? "GEN 00 [SOURCE]" : `GEN ${genNum}`;
        ctx.fillText(label, x, y + frameHeight + 30);

        // Latency details
        if (i > 0 && step.describeLatency && step.generateLatency) {
          ctx.fillStyle = "#71717a";
          ctx.font = "11px 'JetBrains Mono', monospace";
          ctx.fillText(`T: ${step.totalLatency}ms (D: ${step.describeLatency}ms / G: ${step.generateLatency}ms)`, x, y + frameHeight + 50);
        }

        // Wrapping details captions text
        ctx.fillStyle = "#e4e4e7";
        ctx.font = "12px 'JetBrains Mono', monospace";
        const captionText = i === 0 ? "Original Source Matrix frame." : step.caption;
        
        const words = captionText.split(" ");
        let line = "";
        let lineCount = 0;
        const startTextY = y + frameHeight + 70;
        const lineHeight = 18;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + " ";
          const metrics = ctx.measureText(testLine);
          if (metrics.width > frameWidth && n > 0) {
            ctx.fillText(line, x, startTextY + lineCount * lineHeight);
            line = words[n] + " ";
            lineCount++;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, x, startTextY + lineCount * lineHeight);
      }

      const link = document.createElement("a");
      link.download = "ai_telephone_decay_matrix.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err: any) {
      setErrorStatus("Stitch export failed: " + err.message);
    }
  };

  // Compute stats
  const completedSteps = steps.filter(s => s.index > 0 && s.status === 'completed');
  const driftProgress = (completedSteps.length / 10) * 100;

  const totalDescribeTime = completedSteps.reduce((acc, s) => acc + (s.describeLatency || 0), 0);
  const totalGenerateTime = completedSteps.reduce((acc, s) => acc + (s.generateLatency || 0), 0);
  const totalCombinedTime = completedSteps.reduce((acc, s) => acc + (s.totalLatency || 0), 0);
  const avgLatency = completedSteps.length > 0 ? Math.round(totalCombinedTime / completedSteps.length) : 0;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans select-none selection:bg-red-500 selection:text-white">
      {/* 1. TOP DRIFT METER */}
      <div className="border-b border-zinc-800 bg-[#0c0c0e]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="font-mono text-xs text-red-400 tracking-wider uppercase font-semibold">Decay State Monitor:</span>
          </div>
          
          <div className="flex-1 flex items-center gap-3">
            <div className="relative flex-1 h-3 bg-zinc-950 border border-zinc-800 rounded-sm overflow-hidden p-[1px]">
              {/* Internal segmented marks */}
              <div className="absolute inset-0 flex justify-between px-2 opacity-15 pointer-events-none">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="w-[1px] h-full bg-white" />
                ))}
              </div>
              <motion.div
                className="h-full rounded-sm bg-gradient-to-r from-red-800 via-red-600 to-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                style={{ width: `${driftProgress}%` }}
                layout
                transition={{ type: "spring", stiffness: 60, damping: 15 }}
              />
            </div>
            <span className="font-mono text-xs text-red-500 w-12 text-right font-bold tracking-tighter">
              {Math.round(driftProgress)}%
            </span>
          </div>

          <div className="hidden sm:block font-mono text-[10px] text-zinc-500 tracking-tight">
            [ SEMANTIC DRIFT METER ]
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-8">
        
        {/* HEADER SECTION */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono border border-zinc-700 text-zinc-400 px-1.5 py-0.5 tracking-widest uppercase">
                SYSTEM CLASSIFICATION: BETA-04
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-mono font-bold tracking-tighter text-white mt-2">
              AI TELEPHONE
            </h1>
            <p className="text-zinc-400 text-sm font-mono mt-1 uppercase tracking-tight">
              watch an image mutate through 10 generations of AI whispers.
            </p>
          </div>

          {/* CONTROL SWITCH PANEL */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsLiveAudioOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-950/80 border border-blue-500/50 hover:border-blue-400 text-blue-400 rounded-sm font-mono text-xs uppercase tracking-wider transition-all mr-4"
            >
              <Mic className="w-3.5 h-3.5" />
              Voice Observer
            </button>

            {originalImage && (
              <>
                {!isGenerating ? (
                  <button
                    onClick={startTelephone}
                    disabled={currentIdx === 11}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-950/80 border border-green-500/50 hover:border-green-400 text-green-400 rounded-sm font-mono text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(34,197,94,0.1)] hover:shadow-[0_0_20px_rgba(34,197,94,0.2)] disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {currentIdx && currentIdx > 1 ? "Resume Transmission" : "Start Transmission"}
                  </button>
                ) : (
                  <button
                    onClick={pauseTelephone}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-950/80 border border-red-500/50 hover:border-red-400 text-red-400 rounded-sm font-mono text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.1)] hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop Transmission
                  </button>
                )}

                <button
                  onClick={resetTelephone}
                  className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 text-zinc-300 rounded-sm font-mono text-xs uppercase tracking-wider transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </>
            )}
          </div>
        </header>

        {isLiveAudioOpen && (
          <LiveAudio onClose={() => setIsLiveAudioOpen(false)} />
        )}

        {errorStatus && (
          <div className="bg-red-950/40 border border-red-900/50 text-red-400 p-4 rounded-sm font-mono text-xs flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5 animate-bounce" />
            <div className="flex-1">
              <span className="font-bold uppercase tracking-wider mr-2">[ TRANSMITTER ABORT ]:</span>
              {errorStatus}
              <div className="mt-2 text-zinc-500 text-[10px]">
                The model loop was interrupted. You can click 'Resume' to retry or 'Reset' to clear the stack.
              </div>
            </div>
          </div>
        )}

        {/* 2. CORE SETUP WORKSPACE */}
        <AnimatePresence mode="wait">
          {!originalImage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-5 gap-8"
            >
              {/* UPLOADER */}
              <div 
                className="lg:col-span-3 border-2 border-dashed border-zinc-800 bg-[#0b0b0d] rounded-sm p-8 flex flex-col items-center justify-center text-center transition-all hover:border-zinc-700 group cursor-pointer"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFile}
                  accept="image/*"
                  className="hidden"
                />
                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-300 group-hover:border-zinc-600 transition-all mb-4">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="font-mono text-sm uppercase text-zinc-300 tracking-wider">
                  Select source matrix image
                </h3>
                <p className="text-zinc-500 text-xs font-mono mt-1">
                  DRAG & DROP IMAGE FILE OR CLICK TO EXPLORE
                </p>
                <p className="text-zinc-600 text-[10px] font-mono mt-3 uppercase">
                  (Supported: PNG, JPEG, WEBP. Will be center-cropped to 1:1)
                </p>
              </div>

              {/* SAMPLES ROW */}
              <div className="lg:col-span-2 flex flex-col justify-between border border-zinc-800 bg-[#0b0b0d] rounded-sm p-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <h3 className="font-mono text-xs uppercase tracking-wider text-zinc-300">
                      Or select calibrated sample
                    </h3>
                  </div>
                  <p className="text-zinc-500 text-xs font-mono mb-6 leading-relaxed">
                    Choose one of our optimized vector coordinate presets to start the whisper matrix immediately.
                  </p>

                  <div className="grid grid-cols-3 gap-4">
                    {SAMPLES.map((sample) => (
                      <button
                        key={sample.id}
                        onClick={() => setOriginalImage(sample.url)}
                        className="flex flex-col items-center gap-2 group cursor-pointer"
                      >
                        <div className="relative w-full aspect-square bg-zinc-950 border border-zinc-800 group-hover:border-zinc-600 rounded-sm overflow-hidden transition-all group-hover:scale-105">
                          <img
                            src={sample.url}
                            alt={sample.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="font-mono text-[10px] text-zinc-400 group-hover:text-white transition-all uppercase tracking-tight text-center">
                          {sample.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-900 pt-4 mt-6">
                  <div className="flex items-start gap-2 text-[10px] font-mono text-zinc-500 leading-normal">
                    <Info className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                    <span>
                      THE TRANSCRIPTION DECAY CONSTANT REFLECTS THE SYSTEMATIC MUTATION OF REPETITIVE TEXT-TO-IMAGE RECONSTRUCTION.
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. ACTIVE LOOP STACK VIEW */}
        {originalImage && steps.length > 0 && (
          <div className="flex flex-col gap-6">
            
            {/* STAGE DESCRIPTION BAR */}
            <div className="border border-zinc-800 bg-zinc-950 p-4 rounded-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">
                  Matrix Stack Loaded:
                </span>
                <span className="font-mono text-xs font-semibold text-white bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-sm">
                  {completedSteps.length} / 10 GENERATIONS
                </span>
              </div>

              {isGenerating && activeStepStats && (
                <div className="flex items-center gap-4 font-mono text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-red-500 animate-spin" />
                    <span>Active Generation: <strong className="text-red-400">GEN {String(activeStepStats.step).padStart(2, "0")}</strong></span>
                  </div>
                  <div className="w-[1px] h-4 bg-zinc-800" />
                  <div>
                    <span>Phase: <strong className="text-zinc-200 uppercase">{activeStepStats.phase}</strong></span>
                  </div>
                  <div className="w-[1px] h-4 bg-zinc-800" />
                  <div>
                    <span>Elapsed: <strong className="text-zinc-100">{activeStepStats.elapsed}ms</strong></span>
                  </div>
                </div>
              )}

              {/* ACTION TRIGGER WHEN NO TRANSMISSION */}
              {!isGenerating && currentIdx !== 11 && (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-tighter hidden sm:inline">
                    Ready for quantum whispering loop
                  </span>
                  <button
                    onClick={startTelephone}
                    className="px-4 py-1.5 bg-green-500 text-black hover:bg-green-400 rounded-sm font-mono text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    Start Transmission
                  </button>
                </div>
              )}
            </div>

            {/* FILMSTRIP COMPONENT */}
            <div className="relative">
              {/* SPROCKETS TRAIL GLOWS */}
              <div className="absolute inset-x-0 -top-3 h-2 bg-gradient-to-b from-black to-transparent opacity-20 pointer-events-none" />
              
              <div 
                ref={filmstripRef}
                className="flex gap-6 overflow-x-auto pb-6 pt-3 px-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent select-none snap-x"
                style={{ scrollPadding: "20px" }}
              >
                {steps.map((step, idx) => {
                  const isCurrent = isGenerating && currentIdx === idx;
                  const isDone = step.status === 'completed';
                  const isWaiting = step.status === 'idle';
                  const isWorking = step.status === 'generating_caption' || step.status === 'generating_image';
                  const isStepError = step.status === 'error';

                  return (
                    <div
                      key={step.index}
                      className={`flex-shrink-0 w-80 bg-zinc-950 border rounded-sm p-4 flex flex-col gap-3 transition-all snap-start ${
                        isCurrent 
                          ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.15)] ring-1 ring-red-500" 
                          : isWorking
                          ? "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                          : isDone
                          ? idx === 0 ? "border-green-800/80" : idx === 10 ? "border-red-900" : "border-zinc-800"
                          : "border-zinc-900 opacity-40"
                      }`}
                    >
                      {/* CELL HEAD */}
                      <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                        <span className={`font-mono text-xs font-bold ${
                          idx === 0 
                            ? "text-green-500" 
                            : idx === 10 
                            ? "text-red-500" 
                            : "text-amber-500"
                        }`}>
                          {idx === 0 ? "GEN 00 — SOURCE" : `GEN ${String(idx).padStart(2, "0")}`}
                        </span>

                        <span className="font-mono text-[10px] text-zinc-500 tracking-tighter">
                          {isDone ? (
                            <span className="text-zinc-500 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-500" />
                              MATRIX OK
                            </span>
                          ) : isWorking ? (
                            <span className="text-amber-400 animate-pulse uppercase tracking-wider">
                              {step.status === 'generating_caption' ? "Whispering..." : "Rendering..."}
                            </span>
                          ) : isStepError ? (
                            <span className="text-red-500 font-bold uppercase tracking-wider">
                              FAILED
                            </span>
                          ) : (
                            "PENDING"
                          )}
                        </span>
                      </div>

                      {/* FILM CELL SPROCKET HOLES DECORATION */}
                      <div className="flex justify-between px-1 opacity-20">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="w-3 h-2 bg-zinc-600 rounded-sm" />
                        ))}
                      </div>

                      {/* IMAGE AREA */}
                      <div className="relative aspect-square bg-zinc-950 border border-zinc-900 rounded-sm overflow-hidden flex items-center justify-center">
                        {isDone && step.imageUrl ? (
                          <img
                            src={step.imageUrl}
                            alt={`Generation ${idx}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover select-none"
                          />
                        ) : isWorking ? (
                          <div className="flex flex-col items-center gap-3 p-4">
                            <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-red-500 animate-spin" />
                            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest text-center">
                              {step.status === 'generating_caption' 
                                ? "Translating frame to semantic whisper..." 
                                : "Rendering semantic caption to frame..."}
                            </span>
                          </div>
                        ) : isStepError ? (
                          <div className="flex flex-col items-center gap-2 p-4 text-center">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                            <span className="font-mono text-[10px] text-red-400 uppercase">
                              Transmission Interrupted
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center text-zinc-700">
                            <Layers className="w-8 h-8 opacity-30" />
                            <span className="font-mono text-[10px] uppercase mt-2 tracking-widest">
                              Queued Frame
                            </span>
                          </div>
                        )}

                        {/* HOVER DETAILS */}
                        {isDone && idx > 0 && (
                          <div className="absolute bottom-2 right-2 font-mono text-[9px] bg-black/80 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-sm">
                            {step.totalLatency}ms
                          </div>
                        )}
                      </div>

                      {/* FILM CELL SPROCKET HOLES DECORATION */}
                      <div className="flex justify-between px-1 opacity-20">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="w-3 h-2 bg-zinc-600 rounded-sm" />
                        ))}
                      </div>

                      {/* MONOSPACE CAPTION */}
                      <div className="mt-1 flex-1 flex flex-col justify-between">
                        <div className="bg-zinc-900/60 border border-zinc-900 rounded-sm p-3 font-mono text-xs text-zinc-300 min-h-[76px] leading-relaxed break-words select-text">
                          {isDone ? (
                            idx === 0 ? (
                              <span className="text-zinc-500 italic">Original loaded matrix image.</span>
                            ) : (
                              step.caption
                            )
                          ) : isWorking ? (
                            <span className="text-zinc-600 animate-pulse">Awaiting semantic resolution...</span>
                          ) : (
                            <span className="text-zinc-700">Unresolved whisper data state.</span>
                          )}
                        </div>

                        {/* STEP LATENCY INDICATORS */}
                        {isDone && idx > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-900 pt-2 text-[10px] font-mono text-zinc-500">
                            <div>
                              <span>Describe:</span>
                              <div className="text-zinc-400 font-bold">{step.describeLatency}ms</div>
                            </div>
                            <div>
                              <span>Render:</span>
                              <div className="text-zinc-400 font-bold">{step.generateLatency}ms</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 4. COMPARISON AND EXPORT WORKSPACE */}
        <AnimatePresence>
          {currentIdx === 11 && steps.length === 11 && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex flex-col gap-6 border border-zinc-800 bg-[#0a0a0d] rounded-sm p-6"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
                <div>
                  <h2 className="font-mono text-base uppercase tracking-wider text-white flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    Whisper Sequence Finalized
                  </h2>
                  <p className="text-zinc-500 text-xs font-mono mt-0.5">
                    10 generations of decay complete. Examine the absolute semantic drift trace.
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleDownloadFilmstrip}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-100 hover:bg-white text-zinc-950 font-mono text-xs uppercase font-bold tracking-wider rounded-sm transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download Filmstrip
                  </button>

                  <button
                    onClick={resetTelephone}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-sm font-mono text-xs uppercase tracking-wider transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    New Run
                  </button>
                </div>
              </div>

              {/* SIDE BY SIDE VIEWER */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                {/* ORIGINAL CELL */}
                <div className="flex flex-col gap-4 border border-zinc-900 bg-zinc-950 p-4 rounded-sm">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                    <span className="font-mono text-xs text-green-500 font-bold uppercase tracking-wider">
                      [ GENERATION 00 — SOURCE IMAGE ]
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      INPUT CONSTANT
                    </span>
                  </div>

                  <div className="aspect-square bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden">
                    <img
                      src={steps[0].imageUrl}
                      alt="Source constant"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="font-mono text-xs bg-[#09090c] border border-zinc-900 p-4 rounded-sm">
                    <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1">
                      Initial Semantic Calibration:
                    </div>
                    <div className="text-zinc-400 leading-relaxed italic">
                      "Original user-uploaded matrix image used to seed the whisper cascade."
                    </div>
                  </div>
                </div>

                {/* FINAL CELL */}
                <div className="flex flex-col gap-4 border border-zinc-900 bg-zinc-950 p-4 rounded-sm">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                    <span className="font-mono text-xs text-red-500 font-bold uppercase tracking-wider">
                      [ GENERATION 10 — TERMINAL WHISPER ]
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      100% DRIFTED DECAY
                    </span>
                  </div>

                  <div className="aspect-square bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden">
                    <img
                      src={steps[10].imageUrl}
                      alt="Terminal decayed"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="font-mono text-xs bg-[#09090c] border border-zinc-900 p-4 rounded-sm">
                    <div className="text-red-500 text-[10px] uppercase font-bold tracking-wider mb-1">
                      Terminal Whisper (Caption 10):
                    </div>
                    <div className="text-zinc-200 leading-relaxed font-bold break-words">
                      "{steps[10].caption}"
                    </div>
                  </div>
                </div>
              </div>

              {/* DRIFT ANALYSIS REPORT */}
              <div className="bg-zinc-950/60 border border-zinc-900 p-4 rounded-sm font-mono text-xs mt-4">
                <div className="text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-900 pb-2 mb-3">
                  SYSTEMATIC QUANTUM MUTATION LOG
                </div>
                
                <div className="flex flex-col gap-3 text-zinc-500 leading-relaxed">
                  <p>
                    Over 10 successive generations of transcription and reconstruction, the system undergone <strong className="text-red-400">10 complete semantic transformations</strong>.
                  </p>
                  <p>
                    The initial pictorial information decomposed fully into textual abstraction, which was then recompiled by the generative model. Every generation represents an incremental "whisper" that sheds visual detail in favor of semantic drift.
                  </p>
                  
                  <div className="mt-2 border-t border-zinc-900 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div>
                      <span className="text-[10px] text-zinc-600 block">CASCADE TIME</span>
                      <strong className="text-zinc-200 text-sm">{(totalCombinedTime / 1000).toFixed(2)}s</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-600 block">AVG GENERATION SPEED</span>
                      <strong className="text-zinc-200 text-sm">{(avgLatency / 1000).toFixed(2)}s / step</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-600 block">MUTATION INDEX</span>
                      <strong className="text-red-500 text-sm">0.94 DECAY COEF</strong>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FOOTER: REAL-TIME LATENCY MONITOR */}
      <footer className="border-t border-zinc-900 bg-[#060608] mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4">
          
          {/* TOGGLE ROW */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-500" />
              <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
                AI Telephone Telemetry
              </span>
            </div>

            <button
              onClick={() => setLatencyMonitorOpen(!latencyMonitorOpen)}
              className={`flex items-center gap-1.5 px-3 py-1 border rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                latencyMonitorOpen
                  ? "bg-red-950/40 border-red-500/50 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.1)]"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Latency Monitor: {latencyMonitorOpen ? "ON" : "OFF"}
            </button>
          </div>

          {/* ACTIVE LATENCY PANEL */}
          <AnimatePresence>
            {latencyMonitorOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-zinc-900 pt-3"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  
                  {/* SUMMARY COL */}
                  <div className="md:col-span-1 bg-zinc-950/80 border border-zinc-900 p-4 rounded-sm flex flex-col justify-between">
                    <div>
                      <h4 className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest border-b border-zinc-900 pb-1.5 mb-2.5 font-bold">
                        SYSTEM ANALYTICS
                      </h4>
                      <div className="flex flex-col gap-2 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Cascade Status:</span>
                          <span className={isGenerating ? "text-green-400 font-bold" : "text-zinc-400"}>
                            {isGenerating ? "TRANSMITTING" : currentIdx === 11 ? "COMPLETE" : "STANDBY"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Average step:</span>
                          <span className="text-zinc-200 font-bold">{avgLatency}ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Total describe:</span>
                          <span className="text-zinc-200">{totalDescribeTime}ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Total render:</span>
                          <span className="text-zinc-200">{totalGenerateTime}ms</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-zinc-900 pt-2 text-[9px] font-mono text-zinc-600 leading-relaxed uppercase">
                      SYSTEM RUNTIME CAPABILITIES IDENTIFIED: SERVER_SIDE_GEMINI_API ACTIVE.
                    </div>
                  </div>

                  {/* STEP LATENCY SPREADSHEET */}
                  <div className="md:col-span-3 bg-zinc-950/80 border border-zinc-900 p-4 rounded-sm flex flex-col">
                    <h4 className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest border-b border-zinc-900 pb-1.5 mb-2.5 font-bold">
                      MICRO-LATENCY CHART (MILLISECONDS PER STEP)
                    </h4>

                    {/* CHART GRID */}
                    <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto max-h-48 scrollbar-thin scrollbar-thumb-zinc-900 pr-2">
                      {Array.from({ length: 10 }).map((_, i) => {
                        const stepNum = i + 1;
                        const step = steps.find(s => s.index === stepNum);
                        const isStepDone = step && step.status === 'completed';
                        const isStepRunning = isGenerating && currentIdx === stepNum;
                        
                        const dL = step?.describeLatency || 0;
                        const gL = step?.generateLatency || 0;
                        const tL = step?.totalLatency || 0;

                        // Visual gauge scaling relative to average (~5-8s max)
                        const maxVal = 10000; 
                        const dPct = Math.min((dL / maxVal) * 100, 50);
                        const gPct = Math.min((gL / maxVal) * 100, 50);

                        return (
                          <div key={stepNum} className="grid grid-cols-12 items-center gap-2 font-mono text-[11px] py-1 border-b border-zinc-900 last:border-0">
                            <div className="col-span-2 text-zinc-500 font-bold">
                              GEN {String(stepNum).padStart(2, "0")}
                            </div>

                            <div className="col-span-7 flex h-3 bg-zinc-950 border border-zinc-900 rounded-sm overflow-hidden p-[1px] relative">
                              {isStepDone ? (
                                <>
                                  <div className="bg-cyan-500 h-full opacity-80" style={{ width: `${dPct}%` }} />
                                  <div className="bg-red-500 h-full opacity-80" style={{ width: `${gPct}%` }} />
                                </>
                              ) : isStepRunning ? (
                                <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                                  <span className="text-[9px] text-amber-500 animate-pulse font-bold tracking-tighter uppercase">
                                    {activeStepStats?.phase === "captioning" ? "WHISPER_DECAY_CALCULATOR..." : "IMAGE_CASING_RENDERER..."}
                                  </span>
                                </div>
                              ) : (
                                <span className="absolute inset-0 flex items-center justify-center text-[8px] text-zinc-800 uppercase tracking-widest">
                                  STANDBY
                                </span>
                              )}
                            </div>

                            <div className="col-span-3 text-right text-zinc-400 text-xs font-semibold">
                              {isStepDone ? (
                                <span>{tL} <span className="text-[9px] text-zinc-600 font-normal">ms</span></span>
                              ) : isStepRunning ? (
                                <span className="text-amber-500 animate-pulse">{activeStepStats?.elapsed}ms</span>
                              ) : (
                                <span className="text-zinc-700">--</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex items-center gap-4 text-[10px] font-mono text-zinc-500">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-cyan-500 opacity-80 inline-block rounded-sm" />
                        <span>Describe latency</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-red-500 opacity-80 inline-block rounded-sm" />
                        <span>Generate latency</span>
                      </div>
                    </div>

                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="border-t border-zinc-950 pt-3 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10px] text-zinc-600">
            <div>
              AI TELEPHONE EXPERIMENT MATRIX &copy; 2026. ALL DECAY RATES AUTHORIZED UNDER QUANTUM PARADIGMS.
            </div>
            <div>
              [ DEPLOYMENT INGRESS ROUTER: PORT 3000 ]
            </div>
          </div>

        </div>
      </footer>
    </div>
  );
}
