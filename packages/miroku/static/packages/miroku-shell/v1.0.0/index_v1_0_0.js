class MirokuRegistry {
  constructor(name, packages) {
    this.name = name;
    this._packages = {};
    this._loaded = {};

    this.get = this.get.bind(this);
    this.getAsync = this.getAsync.bind(this);

    this.init(packages);
  }

  async init(packages) {
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

function mirokuConfigParser(value) {
  try {
    const rawObj = JSON.parse(value);
    return Object.keys(rawObj).reduce((acc, key) => {
      const item = rawObj[key];
      if (key === 'registry') {
        acc.registry = new MirokuRegistry('mainRegistry', item);
        return acc;
      }
      let value;
      switch (item.type) {
        case "raw": {
          value = item.value;
          break;
        }
        case "fn": {
          value = eval(item.value)();
          break;
        }
        default: {
          value = item;
        }
      }
      acc[key] = value;
      return acc;
    }, {});
  } catch(err) {
    console.error(err);
  }
  delete window.__mirokuRaw;
}

window.miroku = mirokuConfigParser(window.__mirokuRaw);
