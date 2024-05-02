import { readdir } from "node:fs/promises";

async function isDir(path: string) {
  try {
    await readdir(path);
    return true;
  } catch (err) {
    return false;
  }
};

const portNum = Number(process.env.PORT) || 3000;

Bun.serve({
  async fetch(req: any) {

    const url = new URL(req.url);
    const [_, reqType, ...pathCon] = url.pathname.split('/');
    const path = pathCon.join('/');
    const [filename, ...dirs] = path.split('/').reverse();
    const dirsPath = dirs.reverse().join('/').replaceAll("..", "");
    let finalPath = `./${dirsPath}/${filename}`;
    if (!dirsPath) {
      finalPath = `./${filename}`;
    }

    if (req.method === "POST") {
      const formdata = await req.formData();
      const newFile = formdata.get('file');
      if (!newFile) throw new Error('Must upload a file.');
      await Bun.write(finalPath, newFile);
      return new Response("Success");
    }

    const file = Bun.file(finalPath);
    const exists = await file.exists();
    if (exists) {
      if (reqType === "stats") {
        return new Response(JSON.stringify({ isDir: false, name: filename, type: file.type, size: file.size }), {
          headers: {
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
            "X-dirorfile": "file"
          }
        });
      }
      return new Response(file, {
        headers: {
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
          "Content-Type": "application/json",
          "X-dirorfile": "dir"
        }
      });
  },
  error(error) {
    console.error(error);
    return new Response(`Error catched!`, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  },
  port: portNum,
});

console.log(`Server started on ${portNum}`);
