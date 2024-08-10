import { VxElement, folderSvg } from '../../../../utils/vx-element';
import { FileListStore } from '../../store/file-list';

const { html, css } = window.mirai.pkgRegistry.get('lit');
const { getIcon } = window.mirai.pkgRegistry.get('ft-icons');

const fls = new FileListStore();

class FileList extends VxElement({ listData: fls.fileListSubject }) {
  static get name() { return 'vx-file-list'; }

  static styles = [
    css`
      ul.file-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-inline-start: 8px;
      }
      li.elem {
        cursor: pointer;
        display: flex;
        gap: 4px;
        font-size: 1.5em;
        padding: 8px;
        align-items: center;
      }
      li.elem:hover {
        background-color: rgba(0, 0, 0, .05);
      }
      li.elem > span {
        display: block;
        width: 32px;
        height: 32px;
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

  renderDir(path) {
    return html`<li class="elem is-dir" @click=${path !== ".." ? this.upPath(path) : this.downPath}>${folderSvg}${path}</li>`;
  }

  renderFile(path) {
    const { svg: svgVal } = getIcon(path);
    const iconWrap = document.createElement('span');
    iconWrap.innerHTML = svgVal;
    return html`<li class="elem is-file" @click=${this.download(path)}>${iconWrap}${path}</li>`;
  }

  render() {
    return html`
      <div>
        <p>Current path: ${this.currentDir}</p>
        <ul class="file-list">
          ${this.listData.map(({ isDir, path }) => isDir ? 
            this.renderDir(path) : this.renderFile(path)
          )}
        </ul>
      </div>`;
  }
}

customElements.define(FileList.name, FileList);
