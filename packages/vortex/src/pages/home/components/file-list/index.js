import { html } from 'lit';
import { VxElement } from '../../../../utils/vx-element';
import { FileListStore } from '../../store/file-list';

class FileList extends VxElement {
  static get name() { return 'vx-file-list'; }

   static properties = {
    listData: {
      type: Array,
      mapToStore: {
        fileListSubject: FileListStore
      },
      selector: (data) => data,
    },
    currentDir: {
      type: String,
      mapToStore: {
        currentPathSubject: FileListStore
      },
    }
  };

  render() {
    return html`<p>Hello, VX!</p>`;
  }
}

customElements.define(FileList.name, FileList);
