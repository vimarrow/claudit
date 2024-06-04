class MiraiRegistry {
  constructor(name, packages) {
    this.name = name;
    this._packages = {};
    this._loaded = {};

    this.init(packages);
  }

  init(packages) {
    const instaLoad = packages.filter(({ loadRule }) => loadRule === "*");
    if (instaLoad && instaLoad.length) {
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
    }
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
        case "ctrl": {
          const len = item.value.length;
          for (let i=0; i<len; i++) {
            const controller = item.value[i];
            if (controller.dependencies && controller.dependencies.length) {
              Promise.allSettled(
                controller.dependencies.map((pkgName) => window.mirai.pkgRegistry.getAsync(pkgName))
              ).then(() => import(controller.location));
            } else {
              import(controller.location);
            }
            if (controller.loadRule === "*") {
              break;
            }
          }
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
  delete window.miraiRawConfig;
  delete window.mirai-xsrf;
}

window.mirai = miraiConfigParser(window.miraiRawConfig, window.mirai-xsrf);
