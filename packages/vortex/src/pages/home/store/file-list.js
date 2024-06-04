const { BehaviorSubject } = window.mirai.pkgRegistry.get('rxjs');

export class FileListStore { // extends BaseStore?
  constructor() {
    this.fileListSubject = new BehaviorSubject([]);
  }

  getPathFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const b64Path = params.get('location') ?? "Lw==";
    let initDefaultPath = '';
    try {
      initDefaultPath = atob(b64Path);
    } catch(err) {
      console.error(err);
    }
    return initDefaultPath;
  }

  setPathFromQuery(newPath) {
    const bp = btoa(newPath);
    history.pushState({ newPath }, "", `?location=${bp}`);
    setTimeout(() => this.fetchFileList(), 100);
  }

  async fetchFileList() {
    const path = this.getPathFromQuery();
    try {
      const parsedList = await fetch(`https://claudit-mirror.go.ro${path}`, {
        headers: {
          "Accept": "application/json; charset=utf-8",
          "X-Token": window.mirai._xsrf,
        }
      })
      .then((res) => res.text())
      .then((text) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/html");
        const list = [];
        doc.body.querySelectorAll("li > a").forEach((element) => {
          list.push({ isDir: element.classList.contains("dir"), path: element.innerHTML });
        });
        return list;
      });
      this.fileListSubject.next(parsedList);
    } catch(err) {
      console.log(`failed to fetch data`);
    }
  }
}
