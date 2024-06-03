import { readdir } from "node:fs/promises";

async function isDir(path) {
  try {
    await readdir(path);
    return true;
  } catch (err) {
    return false;
  }
};

const portNum = Number(process.env.PORT) || 3000;
const stdHeaders = {
  "Access-Control-Allow-Origin": process.env.HOST || 'claudit-mirror.go.ro',
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "X-Token,X-dirorfile,X-Validate-FP",
  "Access-Control-Max-Age": "86400"
};

const globalTokens = {};

Bun.serve({
  async fetch(req, srv) {
    const url = new URL(req.url);
    const pathName = url.pathname.startsWith("/") ? url.pathname.substring(1) : url.pathname;
    const [reqType, ...pathCon] = pathName.split('/');

    const ua = req.headers.get('user-agent') || "UNKNOWN!";
    const xsrf_token = req.headers.get('x-token');
    const ip = srv.requestIP(req).address;
    const now = Math.round(new Date().getTime()/1000);
    if (ua === "Mirai WebServer" && ip === '198.244.190.162' && reqType === "new-token") {
      const fp = req.headers.get('x-validate-fp');
      globalTokens[fp] = {
        xsrf: xsrf_token,
        time: now
      };
      return new Response("Success", {
        headers: stdHeaders,
      });
    }

    const hash = `${ua}@${ip}`;
    if (!globalTokens[hash]?.xsrf || now - globalTokens[hash]?.time > 3600) {
      delete globalTokens[hash];
    }

    if (globalTokens[hash]?.xsrf === undefined || globalTokens[hash]?.xsrf !== xsrf_token) {
      return Response("xsrf fail", {
        status: 401,
        headers: stdHeaders,
      });
    }

    const path = pathCon.join('/');
    const [filename, ...dirs] = path.split('/').reverse();
    const dirsPath = dirs.reverse().join('/').replaceAll("..", "");
    let finalPath = `/mnt/${dirsPath}/${filename}`;
    if (!dirsPath) {
      finalPath = `/mnt/${filename}`;
    }

    if (req.method === "POST") {
      const formdata = await req.formData();
      const newFile = formdata.get('file');
      if (!newFile) throw new Error('Must upload a file.');
      await Bun.write(finalPath, newFile);
      return new Response("Success", {
        headers: stdHeaders,
      });
    }

    const file = Bun.file(finalPath);
    const exists = await file.exists();
    if (exists) {
      if (reqType === "stats") {
        return new Response(JSON.stringify({ isDir: false, name: filename, type: file.type, size: file.size }), {
          headers: {
            ...stdHeaders,
            "Content-Type": "application/json",
            "X-dirorfile": "file"
          }
        });
      }
      if (req.headers.get("Range")) {
        const [start = 0, end = Infinity] = req.headers
          .get("Range") // Range: bytes=0-100
          .split("=")
          .at(-1)
          .split("-")
          .map(Number);
        return new Response(file.slice(start, end), {
          headers: {
            ...stdHeaders,
            "X-dirorfile": "file"
          }
        });
      }
      return new Response(file, {
        headers: {
          ...stdHeaders,
          "X-dirorfile": "file"
        }
      });
    }
    const dirContents = await readdir(finalPath);
    if (finalPath.charAt(finalPath.length - 1) === "/") {
      finalPath.slice(-1);
    }
    const fileList = [];
    for (let i=0; i < dirContents.length; i++) {
      const fileName = dirContents[i];
      const thisIsDir = await isDir(`${finalPath}/${fileName}`);
      fileList.push({ isDir: thisIsDir, name: fileName });
    }
    return new Response(JSON.stringify(fileList), {
        headers: {
          ...stdHeaders,
          "Content-Type": "application/json",
          "X-dirorfile": "dir"
        }
      });
  },
  error(error) {
    console.error(error);
    return new Response(`Error catched!`, {
      headers: {
        ...stdHeaders,
        "Content-Type": "text/html",
      },
    });
  },
  port: portNum,
});

console.log(`Server started on ${portNum}`);
