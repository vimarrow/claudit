import { VxElement } from '../../../../utils/vx-element';
import { FileListStore } from '../../store/file-list';

const { html, css } = window.mirai.pkgRegistry.get('lit');

const fls = new FileListStore();

class FileList extends VxElement({ listData: fls.fileListSubject }) {
  static get name() { return 'vx-file-list'; }

  static styles = [
    css`
      ul.file-list {
        list-style-type: none;
      }
    `
  ]

   static properties = {
    listData: {
      type: Array,
    },
    currentDir: {
      type: String,
    }
  };

  constructor() {
    super();
    this.listData = [];
    this.currentDir = fls.getPathFromQuery();
    this.stateChanged = this.stateChanged.bind(this);
    this.upPath = this.upPath.bind(this);
    this.downPath = this.downPath.bind(this);
    this.download = this.download.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    fls.fetchFileList();
  }

  stateChanged(propKey, newValue) {
    this[propKey] = newValue;
  }

  upPath(last) {
    return () => {
      if (this.currentDir === "/") {
        this.currentDir += `${last}`
      } else {
        this.currentDir += `/${last}`;
      }
      fls.setPathFromQuery(this.currentDir);
    };
  }

  downPath() {
    const list = this.currentDir.split("/");
    list.pop();
    this.currentDir = list.join("/");
    fls.setPathFromQuery(this.currentDir === "" ? "/" : this.currentDir);
  }

  download(path) {
    return () => {
      console.log(`Should download ${path}`);
    }
  }

  render() {
    return html`<div>
      <p>Current path: ${this.currentDir}</p>
      <ul class="file-list">
        ${this.listData.map(({ isDir, path }) => isDir ? html`
          <li @click=${path !== ".." ? this.upPath(path) : this.downPath}>${path}</li>
        ` : html`<li @click=${this.download(path)}>${path}</li>`)}
      </ul>
    </div>`;
  }
}

customElements.define(FileList.name, FileList);
