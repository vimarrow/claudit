import { migrate, getMigrations } from "bun-sqlite-migrations";
import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";

const db = new Database("db.sqlite", { create: true });
migrate(db, getMigrations('./migrations'));
// db.exec("PRAGMA journal_mode = WAL;");

const query = db.query("SELECT * FROM config;");
const results = query.all();
const globalConfig = results.reduce((acc, { key, name, value }) => {
  acc[name] = { key, value };
  return acc;
}, {});
const globalTokens = {};

class RequestError extends Error {
  constructor(code, msg, headers = {}) {
    super(msg);
    this.statusCode = code;
    this.headers = headers;
  }
}

class CustomResponse extends Response {
  constructor(data, options = {}) {
    options.headers = {
      ...options.headers,
      "Access-Control-Allow-Origin": globalConfig.public_url.value,
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "X-Token,X-Validate-FP",
      "Access-Control-Max-Age": "86400",
    };
    super(data, options);
  }
}

function runTemplate(templateString, templateVars) {
  return new Function('return `' + templateString + '`').call(templateVars)
}

const injectInitScript = (data, xsrf) => `<script type="text/javascript" type="module">
class MiraiRegistry {
  constructor(name, packages) {
    this.name = name;
    this._packages = {};
    this._loaded = {};

    this.init(packages);
  }

  init(packages) {
    const instaLoad = packages.filter(({ loadRule }) => loadRule === "*");
    Promise.allSettled(
      instaLoad.map(({ location }) => import(location))
    ).then((res) => {
      res.forEach(({ status, value }, index) => {
        const pkgName = instaLoad[index].name;
        if (status !== "fulfilled") {
          console.log("Loading '" + pkgName + "' package failed!");
        }
        this._loaded[pkgName] = value;
      })
    });
    this._packages = packages.reduce((a, { name, loadRule, location }) => {
      a[name] = {
        loadRule,
        location,
        name
      };
      return a;
    }, {});
  }

  get(name) {
    if (this._loaded[name]) {
      return this._loaded[name];
    }
    return null;
  }

  async getAsync(name) {
    let sync = this.get(name);
    if (sync !== null) {
      return sync;
    }
    this._loaded[name] = await import(this._packages[name].location);
    return this._loaded[name];
  }
}

function miraiConfigParser(value, xsrf) {
  try {
    const rawObj = JSON.parse(value);
    const obj = Object.keys(rawObj).reduce((acc, key) => {
      const item = rawObj[key];
      let value;
      switch (item.type) {
        case "str": {
          value = String(item.value);
          break;
        }
        case "fn": {
          value = eval(item.value)();
          break;
        }
        case "pkg": {
          value = new MiraiRegistry(key, item.value);
          break;
        }
        default: {
          value = null;
        }
      }
      acc[key] = value;
      return acc;
    }, {});
    obj._xsrf = xsrf;
    return obj;
  } catch(err) {
    console.error(err);
  }
}
window.mirai = miraiConfigParser('${data}', '${xsrf}');
</script>`;

const serveFile = async (path, cookieValue) => {
  const file = Bun.file(`./static/${path}`);
  if (!(await file.exists())) {
    throw new RequestError(404, "Not found!");
  }
  const headers = {};
  if (cookieValue) {
    headers['Set-Cookie'] = cookieValue;
    // headers['Clear-Site-Data'] = '"cookies","cache","executionContexts"';
  }
  return new CustomResponse(file, { headers });
};

const unauthErr = (bp) => new RequestError(401, "No or invalid credentials!", { 
  'WWW-Authenticate': `Basic realm="mirai/${bp}"`, "Clear-Site-Data": '"cookies","cache","executionContexts"' 
});

async function handleGetReq(req, _srv, hash) {
  const path = new URL(req.url).pathname.slice(1) || 'index.html';
  const pathComponents = path.split("/");
  const basePath = pathComponents[0];
  const filenameComponents = pathComponents.slice(-1)[0].split(".");
  const hasExtension = filenameComponents.length > 1;
  if (pathComponents.length <= 1) {
    if (basePath === "") {
      return serveFile("index.html");
    }
    return serveFile(path);
  }
  const routeQuery = db.query("SELECT base_path, version, template, is_public, config FROM route WHERE base_path = ?;");
  const routeResult = routeQuery.values(basePath);
  if (routeResult.length !== 1) {
    if (hasExtension) {
      return serveFile(path);
    }
    throw new RequestError(404, "Not found!");
  }
  const isPublic = routeResult[0][3];
  let cookieValue;
  const oldCookie = req.headers.get('cookie');
  const sessionId = oldCookie?.split(";")?.find((c) => c.startsWith("miraisession"))?.split("=")?.[1];
  const hasValidSession = sessionId !== undefined && sessionId === globalTokens[hash].sessionId;
  if (!isPublic && !hasValidSession) {
    console.log("validating session");
    const [type, creds] = (req.headers.get('Authorization') ?? "None 0").split(" ");
    if (type === "None") {
      throw unauthErr(basePath);
    }
    if (type === "Basic") {
      const [userData, pwd] = atob(creds).split(":");
      const [user, group] = userData.split("@");
      let accountResult;
      if (group) {
        const accountQuery = db.query("SELECT user_group, username, pw_hash FROM account WHERE user_group = ? AND username = ?;");
        accountResult = accountQuery.values(group, user);
      } else {
        const accountQuery = db.query("SELECT user_group, username, pw_hash FROM account WHERE user_group = NULL AND username = ?;");
        accountResult = accountQuery.values(user);
      }
      if (accountResult.length !== 1) {
        throw unauthErr(basePath);
      }
      if (accountResult[0][2] !== pwd) {
        throw unauthErr(basePath);
      }
      const sessionId = randomUUID();
      globalTokens[hash].sessionId = sessionId;
      // maybe path should be basepath
      cookieValue = `miraisession=${sessionId}; path=/; domain=${globalConfig.domain.value}; HttpOnly; SameSite=Strict; Max-Age=86400`; // Add secure
    } else {
      throw unauthErr(basePath); 
    }
  }
  if (hasExtension) {
    return serveFile(path, cookieValue);
  }
  const templateQuery = db.query("SELECT id, mime_type, content, static_params FROM template WHERE id = ?;");
  const templateId = routeResult[0][2];
  const templateResult = templateQuery.values(templateId);
  if (templateResult.length !== 1) {
    throw new RequestError(500, "Template not found!");
  }
  const [_, mimeType, content, staticParams] = templateResult[0];
  const staticParamsObj = JSON.parse(staticParams);
  const templateContext = Object.keys(staticParamsObj).reduce((acc, key) => {
    const item = staticParamsObj[key];
    if (item.compute) {
      try {
        const computedValue = eval(item.compute)(req);
        if (computedValue) {
          acc[key] = computedValue;
          return acc;
        }
      } catch (err) {
        console.warn(`failed to compute dynamic value for param ${key} in templateId ${templateId}`);
      }
    }
    acc[key] = item.value;
    return acc;
  }, {});
  templateContext._init_script = injectInitScript(routeResult[0][4], globalTokens[hash].xsrf);
  const htmlResult = runTemplate(content, templateContext);
  const headers = {
    "Content-Type": mimeType,
  };
  if (cookieValue) {
    headers['Set-Cookie'] = cookieValue;
  }
  return new CustomResponse(htmlResult, {
    status: 200,
    headers,
  });
}

let clearTokenList;

const server = Bun.serve({
  async fetch(req, srv) {
    const ua = req.headers.get('user-agent') || "UNKNOWN!";
    const ip = srv.requestIP(req).address;
    const hash = `${ua}@${ip}`;
    const now = Math.round(new Date().getTime()/1000);
    if (!globalTokens[hash]?.xsrf || now - globalTokens[hash]?.time > 3600) {
      // TODO: push to globalConfig.peerServers the new xsrf token for this fingerprint;
      globalTokens[hash] = { xsrf: randomUUID(), time: now };
    }
    if (clearTokenList) {
      clearTimeout(clearTokenList);
    }
    clearTokenList = setTimeout(() => {
      const now = Math.round(new Date().getTime()/1000);
      Object.keys(globalTokens).forEach((key) => {
        if (now - globalTokens[key]?.time > 86400) {
          delete globalTokens[key];
        }
      })
    }, 10000);
    switch (req.method) {
      case "GET": {
        return handleGetReq(req, srv, hash);
      } 
      case "OPTIONS": {
        const fp = req.headers.get('x-validate-fp');
        const token = req.headers.get('x-token');
        let isValid = globalTokens[fp]?.xsrf && globalTokens[fp]?.xsrf.length && token && token.length;
        isValid = globalTokens[fp]?.xsrf === token && ip === "127.0.0.1";
        return new CustomResponse("", {
          status: 201,
          headers: {
            "X-Token-Valid": String(isValid)
          }
        });
      }
      default: {
        throw RequestError(405, "Method not allowed!");
      }
    }
  },
  port: globalConfig.http_port.value,
  hostname: globalConfig.http_ip.value,
  tls: globalConfig.tls.value === 'yes' ? {
    cert: Bun.file(globalConfig.tls_cert.value),
    key: Bun.file(globalConfig.tls_key.value),
    ca: [Bun.file(globalConfig.tls_ca)]
  } : undefined,
  error(error) {
    return new CustomResponse(`<pre>${error.message}\n${error.stack}</pre>`, {
      status: error.statusCode || 500,
      headers: {
        ...error.headers,
        "Content-Type": "text/html",
      },
    });
  },
});

console.log(`Listening on ${server.url}`);
