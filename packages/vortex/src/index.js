import { unsafeCSS } from 'lit';
import tw from './tw.css?inline'

document.adoptedStyleSheets.push(unsafeCSS(tw).styleSheet);

import './pages/home/components/file-list/index.js';
