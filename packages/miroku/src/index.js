import Valkey from "iovalkey";
import { ip } from "elysia-ip";
import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import staticPlugin from "@elysiajs/static";
import { rateLimit } from 'elysia-rate-limit';
import { compression } from "elysia-compression";
import { serverTiming } from '@elysiajs/server-timing';

import appConfig from "../config.json";

function runTemplate(templateString, templateVars) {
  return new Function('return `' + templateString + '`').call(templateVars)
}

const vk = new Valkey('****');

const xsrfTokens = {};

const formatMemoryUsage = (data) => `${Math.round(data / 1024 / 1024 * 100) / 100} MB`;

async function buildApp() {
  const app = new Elysia();
  app.use(cors({
    origin: appConfig.public_url,
    methods: ['OPTIONS', 'GET', 'POST'],
    allowedHeaders: ['Authorization', 'X-Token'],
  }))
  .use(ip())
  .use(rateLimit({
    max: 100
  }))
  .use(compression())
  .use(serverTiming())
  .use(staticPlugin({
    assets: 'static/packages',
    prefix: '/_static',
  }));

  for (let i=0; i<appConfig.routes.length; i++) {
    try {
      let serverMiddleware;
      let serverModule;
      const { path, name, imports, template, middleware } = appConfig.routes[i];
      const basePath = `./static/routes/${name}`;
      const templateStr = await Bun.file(`${basePath}/${template ?? 'index'}.html`).text();
      if (middleware) {
        serverMiddleware = await import(`./static/routes/${middleware}.js`);
      }
      serverModule = await import(`.${basePath}/${imports ?? 'index'}.js`);
      const routeConfig = await import(`.${basePath}/config.json`);
      app.get(path, async (request) => {
        const context = {
          _vk
        };
        if (serverMiddleware) {
          const res = await serverMiddleware.default(request, context);
          if (res !== null) {
            return res;
          }
        }
        if (serverModule.default) {
          const res = await serverModule.default(request, context);
          if (res !== null) {
            return res;
          }
        }
        for (let i=0; i<routeConfig.server.length; i++) {
          const { key, compute, value } = routeConfig.server[i];
          let actualValue = value;
          if (compute) {
            try {
              actualValue = await serverModule[compute](request, context);
            } catch(err) {
              console.warn(`failed compute params: ${compute}`);
            }
          }
          context[key] = actualValue;
        }
        const { registry, config } = routeConfig.client;
        const rawConfig = await config.reduce(async (a, c) => {
          let actualValue = c.value;
          if (c.type === "raw" && c.compute) {
            try {
              actualValue = await serverModule[c.compute](request, context, a);
            } catch(err) {
              console.warn(`failed compute globals: ${c.compute}`);
            }
          }
          a[c.key] = { type: c.type, value: actualValue };
          return a;
        }, {});
        rawConfig.registry = registry;
        rawConfig.xsrf = '1234';
        const __headSection = registry.map((r) => `<link rel="modulepreload" href="${r.location}">`).join('\n');
        const __endBodySection = [
          `<script defer src="${appConfig.public_url}/_static/miroku-shell/v1.0.0/index.js"></script>`,
          `<script type="text/javascript">window.__mirokuRaw = '${JSON.stringify(rawConfig)}'</script>`
        ].join('\n');
        const htmlResult = runTemplate(templateStr, {
          ...context,
          __headSection,
          __endBodySection
        });
        request.set.headers['Content-Type'] = 'text/html; charset=utf8';
        request.set.headers['X-Powered-By'] = 'Miroku Web Server v1.0.0';

        return htmlResult;
      });
    } catch(err) {
      console.warn(`Invalid path config for ${appConfig.routes[i].path}`);
      console.log(err);
    }
  } 

  app
    .get('/_checkhealth', () => {
      const mem = process.memoryUsage();
      return {
        cpu: process.cpuUsage(),
        mem: {
          rss: formatMemoryUsage(mem.rss),
          heapTotal: formatMemoryUsage(mem.heapTotal),
          heapUsed: formatMemoryUsage(mem.heapUsed),
          external: formatMemoryUsage(mem.external),
          arrayBuffers: formatMemoryUsage(mem.arrayBuffers)
        }
      };
    })
    .onError(({ code }) => {
      console.log("On err:", code);
      return `${code} :(`;
    });

  console.log(`Miroku is running at ${appConfig.public_url}`);
  // console.log(process.env.FOO);

  return app;
}

buildApp().then(async (app) => {
  await Bun.udpSocket({
    port: 1122,
    socket: {
      async data(socket, buf, port, addr) {
        if(buf.toString().startsWith("This is absolutly awesome, now shutdown")) {
          await app.stop();
          app = null;
          Bun.sleep(200);
          process.exit(0);
        }
      } 
    }
  });
  app.listen(appConfig.port);
});

