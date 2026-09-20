import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { DropboxAuth } from "dropbox";

const redirectUri = "http://localhost:3000/api/dropbox/callback";
const clientId = process.env.DROPBOX_APP_KEY;
const clientSecret = process.env.DROPBOX_APP_SECRET;

async function main() {
  if (!clientId || !clientSecret) throw new Error("Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET in .env.local first.");
  // No clientSecret here: the SDK omits code_verifier when a secret is set, breaking PKCE.
  const auth = new DropboxAuth({ clientId });
  const url = (await auth.getAuthenticationUrl(redirectUri, undefined, "code", "offline", undefined, "none", true))
    .replace("https://dropbox.com/", "https://www.dropbox.com/");

  function openBrowser() {
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
  }

  function promptForUrl() {
    console.log(`Open this URL in your browser:\n${url}`);
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise<string | null>((resolve) => {
      readline.question("Paste the full redirected URL:", (answer) => {
        readline.close();
        resolve(answer.trim() || null);
      });
      readline.on("SIGINT", () => {
        readline.close();
        resolve(null);
      });
    });
  }

  async function callbackUrl() {
    openBrowser();
    console.log(`Open this URL in your browser:\n${url}`);
    return new Promise<string | null>((resolve, reject) => {
      const server = createServer((request, response) => {
        const callback = new URL(request.url ?? "/", redirectUri);
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("Dropbox authorization received. You can return to the terminal.");
        server.close();
        resolve(callback.toString());
      });
      server.once("error", async (error: NodeJS.ErrnoException) => {
        if (error.code !== "EADDRINUSE") {
          reject(error);
          return;
        }
        server.close();
        resolve(await promptForUrl());
      });
      server.listen(3000);
    });
  }

  const redirected = await callbackUrl();
  if (!redirected) {
    console.log("No callback URL provided.");
    return;
  }

  const code = new URL(redirected).searchParams.get("code");
  if (!code) throw new Error("The redirected URL did not contain an authorization code.");
  const token = await auth.getAccessTokenFromCode(redirectUri, code);
  const refreshToken = (token.result as { refresh_token?: string }).refresh_token;
  if (!refreshToken) throw new Error("Dropbox did not return a refresh token.");
  console.log(`DROPBOX_REFRESH_TOKEN=${refreshToken}`);
  console.log("Add that line to apps/web/.env.local, then restart the web app.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
