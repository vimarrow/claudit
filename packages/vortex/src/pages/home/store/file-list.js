import { BehaviorSubject } from "rxjs";

export class FileListStore { // extends BaseStore?

  static getPathFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const b64Path = params.get('location') ?? "Lw==";
    let initDefaultPath = '/';
    try {
      initDefaultPath = atob(b64Path);
    } catch(err) {
      console.error(err);
    }
    return initDefaultPath;
  }

  constructor() {
    this.currentPathSubject = BehaviorSubject(this.getPathFromQuery());
    this.fileListSubject = BehaviorSubject([]);
    this.fetchData();
  }

  async fetchData() {
    const path = this.currentPathSubject.getValue();
    fetch(`http://localhost:3000/files${path}`).then(console.log);
  }

}
