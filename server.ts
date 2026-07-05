import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { WebSocketServer } from "ws";

const PORT = 3000;

let aiClient: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing. Please configure it in the Secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();

  // Increase payload size limit for base64 image transfers
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ limit: "20mb", extended: true }));

  // API Check Endpoint
  app.get("/api/config", (req, res) => {
    res.json({
      hasApiKey: !!process.env.GEMINI_API_KEY
    });
  });

  // 1. Describe Image Endpoint
  app.post("/api/describe", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image data. Please upload or select a valid image." });
      }

      const ai = getGemini();

      // Extract base64 and mime type
      const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, "");
      let mimeType = "image/png";
      const match = image.match(/^data:(image\/[a-z]+);base64,/);
      if (match) {
        mimeType = match[1];
      }

      const imagePart = {
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      };

      const textPart = {
        text: "Describe this image in one vivid, detailed sentence. Only the sentence, nothing else.",
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textPart] },
      });

      const caption = response.text || "A mysterious morphing object.";
      res.json({ caption: caption.trim() });
    } catch (err: any) {
      console.error("Describe image error:", err);
      res.status(500).json({ error: err.message || "Failed to analyze image." });
    }
  });

  // 2. Generate Image Endpoint using free Pollinations API instead of Paid Gemini API
  app.post("/api/generate", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Missing text prompt for image generation." });
      }

      // Use pollinations.ai for free image generation to avoid paid APIs
      const width = 512;
      const height = 512;
      const seed = Math.floor(Math.random() * 1000000);
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

      const imageRes = await fetch(pollinationsUrl);
      if (!imageRes.ok) {
        throw new Error("Failed to generate image from free API.");
      }
      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64EncodeString = buffer.toString("base64");

      const imageUrl = `data:image/jpeg;base64,${base64EncodeString}`;
      res.json({ image: imageUrl });
    } catch (err: any) {
      console.error("Generate image error:", err);
      res.status(500).json({ error: err.message || "Failed to generate image." });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Telephone server running on http://0.0.0.0:${PORT}`);
  });

  // WebSocket Server for Live API (gemini-3.1-flash-live-preview)
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (clientWs) => {
    try {
      const ai = getGemini();
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are the AI Telephone observer. Speak briefly and mysteriously about the visual semantic decay of images.",
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ audio }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
        },
      });

      clientWs.on("message", (data) => {
        try {
          const { audio } = JSON.parse(data.toString());
          if (audio) {
            session.sendRealtimeInput({
              audio: { data: audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (e) {
          console.error("Error processing websocket message:", e);
        }
      });

      clientWs.on("close", () => {
        // We can't cleanly close the session currently, but we stop listening
      });
    } catch (e) {
      console.error("Failed to initialize Live API session:", e);
      clientWs.send(JSON.stringify({ error: "Failed to connect to Live API" }));
      clientWs.close();
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
