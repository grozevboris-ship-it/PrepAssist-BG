import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import cookieSession from "cookie-session";
import multer from "multer";

dotenv.config();

import officeParser from "officeparser";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Session configuration for iframe compatibility
  app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'gem-forge-default-secret'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  }));

  app.use(express.json());

  const upload = multer({ storage: multer.memoryStorage() });

  // Debug middleware
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // API Routes
  app.get("/api/auth/github/url", (req, res) => {
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID || "",
      redirect_uri: redirectUri,
      scope: "read:user repo",
      state: Math.random().toString(36).substring(7),
    });
    const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
    res.json({ url });
  });

  app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const data: any = await response.json();

      if (data.access_token) {
        // Fetch user data
        const userResponse = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            "User-Agent": "aistudio-build",
          },
        });
        const userData = await userResponse.json();
        
        // Store in session
        if (req.session) {
          req.session.githubToken = data.access_token;
          req.session.githubUser = userData;
        }

        res.send(`
          <html>
            <body style="background: #0a0a0a; color: #d4d4d4; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              </script>
              <div style="text-align: center;">
                <h2 style="color: #f43f5e; font-size: 24px;">Authentication Successful</h2>
                <p style="opacity: 0.6;">Connecting to GitHub... This window will close automatically.</p>
              </div>
            </body>
          </html>
        `);
      } else {
        res.status(500).send("OAuth failed: " + JSON.stringify(data));
      }
    } catch (error: any) {
      console.error("OAuth Callback Error:", error);
      res.status(500).send("OAuth error: " + error.message);
    }
  });

  app.get("/api/auth/user", (req, res) => {
    try {
      if (req.session && req.session.githubUser) {
        res.json({ user: req.session.githubUser });
      } else {
        res.json({ user: null });
      }
    } catch (e) {
      res.json({ user: null });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    if (req.session) {
      req.session = null;
    }
    res.json({ success: true });
  });
  app.post("/api/github/sync", async (req, res) => {
    if (!req.session || !req.session.githubToken) {
      return res.status(401).json({ error: "Not authenticated with GitHub" });
    }

    try {
      const { Octokit } = await import("octokit");
      const octokit = new Octokit({ auth: req.session.githubToken });
      const user = req.session.githubUser;
      const repoName = "prep-assist-bg";
      
      // 1. Check if repo exists, if not create it
      let repo;
      try {
        const { data } = await octokit.rest.repos.get({
          owner: user.login,
          repo: repoName,
        });
        repo = data;
      } catch (e) {
        const { data } = await octokit.rest.repos.createForAuthenticatedUser({
          name: repoName,
          description: "Created via PrepAssist BG Studio",
          private: false,
        });
        repo = data;
      }

      // 2. Get all files to push
      const fs = await import("fs/promises");
      const globFiles = async (dir: string, baseDir: string = ""): Promise<{ path: string, content: string }[]> => {
        const items = await fs.readdir(dir, { withFileTypes: true });
        let files: { path: string, content: string }[] = [];
        
        for (const item of items) {
          const resPath = path.resolve(dir, item.name);
          const relPath = path.join(baseDir, item.name);
          
          if (item.isDirectory()) {
            if (item.name === "node_modules" || item.name === ".git" || item.name === "dist") continue;
            files = [...files, ...(await globFiles(resPath, relPath))];
          } else {
            const content = await fs.readFile(resPath, "utf8");
            files.push({ path: relPath, content });
          }
        }
        return files;
      };

      const projectFiles = await globFiles(process.cwd());

      // 3. Create a commit (simple method: put all files in a single tree)
      // First, get the default branch
      const { data: repoData } = await octokit.rest.repos.get({
        owner: user.login,
        repo: repoName,
      });
      const defaultBranch = repoData.default_branch;

      // Get latest commit SHA from default branch
      let latestCommitSha = "";
      try {
        const { data: refData } = await octokit.rest.git.getRef({
          owner: user.login,
          repo: repoName,
          ref: `heads/${defaultBranch}`,
        });
        latestCommitSha = refData.object.sha;
      } catch (e) {
        // Empty repo, create first commit
      }

      // Create blobs and tree
      const treeItems = projectFiles.map(file => ({
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        content: file.content,
      }));

      const { data: treeData } = await octokit.rest.git.createTree({
        owner: user.login,
        repo: repoName,
        tree: treeItems,
        base_tree: latestCommitSha || undefined,
      });

      const { data: commitData } = await octokit.rest.git.createCommit({
        owner: user.login,
        repo: repoName,
        message: "Sync from PrepAssist BG Studio",
        tree: treeData.sha,
        parents: latestCommitSha ? [latestCommitSha] : [],
      });

      await octokit.rest.git.updateRef({
        owner: user.login,
        repo: repoName,
        ref: `heads/${defaultBranch}`,
        sha: commitData.sha,
        force: true,
      });

      res.json({ success: true, url: repoData.html_url });
    } catch (error: any) {
      console.error("GitHub Sync Error:", error);
      res.status(500).json({ error: error.message || "Failed to sync to GitHub" });
    }
  });

  // Helper function for image generation
  async function generateMeetingImage(imagePrompt: string, title: string) {
    const modelsToTry = [
      "gemini-2.5-flash-image",
      "gemini-3.1-flash-image-preview",
      "gemini-2.0-flash"
    ];
    
    const prompt = `A professional, corporate-style conceptual cover image for a meeting titled "${title || 'Meeting Strategy'}". 
    Visual concept: ${imagePrompt}. 
    Style: Minimalist, modern glassmorphism, design, 8k resolution, suitable for a professional report cover.`;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting image generation with model: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            imageConfig: {
              aspectRatio: "16:9"
            }
          }
        });

        const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (part?.inlineData) {
          console.log(`Image successfully generated with ${modelName}.`);
          return `data:image/png;base64,${part.inlineData.data}`;
        }
        console.warn(`Model ${modelName} returned no image data.`);
      } catch (error: any) {
        // Log the error but continue to next model
        console.warn(`Model ${modelName} failed: ${error.message}`);
        
        // If it's a safety error, we might want to stop early, but for quota (429) definitely continue
        if (error.status === 429) {
          console.log(`Quota exceeded for ${modelName}, trying next model...`);
        }
      }
    }

    console.error("All image generation models failed.");
    return null;
  }

  app.post("/api/meeting/prepare", upload.fields([{ name: 'notes' }, { name: 'slides' }]), async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const { additionalNotes, model = "gemini-3-flash-preview" } = req.body;
      const notesFile = files['notes']?.[0];
      const slidesFile = files['slides']?.[0];

      const supportedMimeTypes = [
        "application/pdf", 
        "image/png", 
        "image/jpeg", 
        "image/webp", 
        "image/heic", 
        "image/heif",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint"
      ];
      
      if (notesFile && !supportedMimeTypes.includes(notesFile.mimetype)) {
        return res.status(400).json({ error: `Unsupported file type for notes: ${notesFile.mimetype}. Please use PDF, Images, or PowerPoint.` });
      }
      if (slidesFile && !supportedMimeTypes.includes(slidesFile.mimetype)) {
        return res.status(400).json({ error: `Unsupported file type for slides: ${slidesFile.mimetype}. Please use PDF, Images, or PowerPoint.` });
      }

      if (!notesFile && !slidesFile && !additionalNotes) {
        return res.status(400).json({ error: "Please provide at least one input (notes PDF, slides, or manual notes)." });
      }

      const parts: any[] = [
        { text: `You are a Meeting Prep Assistant. When given a Notes PDF and presentation slides, 
you must output ONLY valid JSON with this structure:

{
  "summary": "2-3 sentence meeting overview",
  "risks": ["risk 1", "risk 2", "risk 3"],
  "talking_points": ["point 1", "point 2", "point 3"],
  "next_steps": ["step 1", "step 2"],
  "cover_image_prompt": "A detailed image generation prompt for this meeting"
}

Ground all outputs strictly in the provided documents. Do not hallucinate facts.

You must cite which document each risk came from. 
Risks must be specific, not generic. Limit next steps to 3 max.

Before outputting JSON, internally reason: 
1. What is the core objective of this meeting?
2. What could go wrong?
3. What decisions need to be made?
Then produce the JSON output.
        
        ${additionalNotes ? `Additional Context from User: "${additionalNotes}"` : ""}` }
      ];

      if (notesFile) {
        if (notesFile.mimetype.includes("presentation") || notesFile.mimetype.includes("powerpoint")) {
          const pptText = await new Promise((resolve, reject) => {
            officeParser.parseOffice(notesFile.buffer, (data: any, err: any) => {
              if (err) reject(err);
              else resolve(data);
            });
          });
          parts.push({ text: `Extracted content from Notes PowerPoint: \n\n ${pptText}` });
        } else {
          parts.push({
            inlineData: {
              mimeType: notesFile.mimetype,
              data: notesFile.buffer.toString("base64")
            }
          });
        }
      }

      if (slidesFile) {
        if (slidesFile.mimetype.includes("presentation") || slidesFile.mimetype.includes("powerpoint")) {
          const pptText = await new Promise((resolve, reject) => {
            officeParser.parseOffice(slidesFile.buffer, (data: any, err: any) => {
              if (err) reject(err);
              else resolve(data);
            });
          });
          parts.push({ text: `Extracted content from Slides PowerPoint: \n\n ${pptText}` });
        } else {
          parts.push({
            inlineData: {
              mimeType: slidesFile.mimetype,
              data: slidesFile.buffer.toString("base64")
            }
          });
        }
      }

      const response = await ai.models.generateContent({
        model: model,
        contents: { parts: parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              risks: { type: Type.ARRAY, items: { type: Type.STRING } },
              talking_points: { type: Type.ARRAY, items: { type: Type.STRING } },
              next_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
              cover_image_prompt: { type: Type.STRING }
            },
            required: ["summary", "risks", "talking_points", "next_steps", "cover_image_prompt"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from AI model.");
      }

      const meetingData = JSON.parse(text);

      // Generate image immediately before returning
      try {
        const imageUrl = await generateMeetingImage(meetingData.cover_image_prompt, meetingData.summary.substring(0, 50));
        meetingData.imageUrl = imageUrl;
      } catch (imgErr) {
        console.error("Image generation failed during prep:", imgErr);
        // We still return the report even if image fails
      }

      res.json(meetingData);
    } catch (error: any) {
      console.error("Meeting Prep Error:", error);
      const errorMessage = error.message || "Failed to analyze materials.";
      res.status(error.status || 500).json({ error: errorMessage });
    }
  });

  app.post("/api/meeting/image", async (req, res) => {
    try {
      const { imagePrompt, title } = req.body;
      const imageUrl = await generateMeetingImage(imagePrompt, title);
      
      if (imageUrl) {
        res.json({ imageUrl });
      } else {
        res.status(500).json({ error: "The models did not produce an image. This might be due to safety filters or model limitations." });
      }
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      res.status(error.status || 500).json({ error: error.message || "Failed to generate image." });
    }
  });


  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express Error Handler:", err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(err.status || 500).json({ 
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV !== "production" ? err.stack : undefined
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
