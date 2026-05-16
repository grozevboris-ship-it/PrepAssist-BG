import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import cookieSession from "cookie-session";

dotenv.config();

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
    if (req.session && req.session.githubUser) {
      res.json({ user: req.session.githubUser });
    } else {
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

  app.post("/api/gem/generate", async (req, res) => {
    try {
      const { description } = req.body;
      const prompt = `Create a unique, magical gemstone based on this description: "${description || 'random'}". 
      Generate a name, a detailed physical description, its magical properties, its rarity level, and a short piece of ancient lore about it.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              properties: { type: Type.ARRAY, items: { type: Type.STRING } },
              rarity: { type: Type.STRING, enum: ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"] },
              lore: { type: Type.STRING },
              color: { type: Type.STRING, description: "Main color theme in hex or simple name" }
            },
            required: ["name", "description", "properties", "rarity", "lore", "color"]
          }
        }
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Gem Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate gem." });
    }
  });

  app.post("/api/gem/image", async (req, res) => {
    try {
      const { gemData } = req.body;
      const prompt = `A highly detailed, professional macro photograph of a magical gemstone named "${gemData.name}". 
      It is described as: ${gemData.description}. It glows with ${gemData.color} energy and has crystalline facets. 
      Cinematic lighting, dark background, 8k resolution, photorealistic.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          }
        }
      });

      const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        res.json({ imageUrl: `data:image/png;base64,${part.inlineData.data}` });
      } else {
        res.status(500).json({ error: "No image generated." });
      }
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate image." });
    }
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
