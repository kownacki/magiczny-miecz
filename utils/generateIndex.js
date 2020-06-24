import fs from 'fs';
import _ from 'lodash/fp.js';
import {noopTag} from 'mk-utils/general.js';
import {apiKey, headerHeight, namePrefix} from '../config.js';
import analyticsScript from './generateIndex/analyticsScript.js';
import preRender from './generateIndex/preRender.js';
import preloadFirebaseAndApp from './generateIndex/preloadFirebaseAndApp.js';
import initializeFirebaseAndApp from './generateIndex/initializeFirebaseAndApp.js';

// to trigger syntax highlighting
const css = noopTag(_);

const title = 'Magiczny Miecz';
const faviconPath = '/resources/images/favicon.ico';
const fontsRootPath =  '/resources/fonts/';
const fonts = [
// add fonts
];
const scriptsRootPath =  '/resources/scripts/';
const scripts = [
  {path: `${scriptsRootPath}lodashBundle.js`, module: true},
];
const firebaseRootPath = '/__/firebase/7.15.4/';
const firebaseLibs = ['app', 'auth', 'firestore', 'storage'];
const firebaseInitializeOptions = {
  apiKey,
  authDomain: "magiczny-miecz.firebaseapp.com",
  databaseURL: "https://magiczny-miecz.firebaseio.com",
  projectId: "magiczny-miecz",
  storageBucket: "magiczny-miecz.appspot.com",
  messagingSenderId: "950105063399",
  appId: "1:950105063399:web:eee592820d975aa48f4742"
};

const indexHtml = `
<!doctype html>
<html lang="pl">
<head>
  ${analyticsScript}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>${title}</title>
  <meta name="description">
  
  <link rel="shortcut icon" href="${faviconPath}">
  ${'' /*todo don't use external sources */}
  <link href="https://fonts.googleapis.com/css?family=Material+Icons&display=block" rel="stylesheet">
  
  ${_.map((font) => `
    <link rel="preload" href="${font.path}" as="font" crossorigin="anonymous">
  `, fonts).join('')}
  ${_.map((script) => `
    <link rel="preload" href="${script.path}" as="script" ${script.module ? 'crossorigin="anonymous"' : ''}>
  `, scripts).join('')}
  ${preloadFirebaseAndApp(namePrefix, firebaseRootPath, firebaseLibs)}
  <link rel="preload" href="/src/styles/shared-styles.js" as="script" crossorigin="anonymous">
  <link rel="preload" href="/src/styles/ck-content.js" as="script" crossorigin="anonymous">
  
  <style>
    html, body {
      height: 100%;
    }
    body {
      margin: 0;
      --primary-color: #7986cb;
      --primary-color-rgb: 121, 134, 203;
      --secondary-color: #263238;
      --secondary-color-rgb: 117, 117, 117;
      --placeholder-color: var(--paper-grey-500);
      --placeholder-color-rgb: 158, 158, 158;
      --divider-color: rgba(0, 0, 0, 0.12);
      --grey-text: rgba(0, 0, 0, 0.6);
      --error-color: var(--paper-red-800);
      --correct-color: var(--paper-green-800);
      --logotype-color: #84979E;
      --logotype-color-filter: invert(73%) sepia(6%) saturate(853%) hue-rotate(150deg) brightness(91%) contrast(79%);
      --header-height: ${headerHeight}px;
      --layer-header: 100;
      --layer-header-1: 101;
      --layer-profitroom: 999; /* Profitroom snippet layer*/
      --layer-profitroom-1: 1000;
      font-family: 'Muli', sans-serif;
      color: var(--secondary-color);
    }
    ${_.map((font) => css`
      @font-face {
        font-family: '${font.family}';
        font-style: ${font.style};
        font-weight: ${font.weight};
        font-display: swap;
        src: url(${font.path}) format('truetype');
      }
    `, fonts).join('')}
  </style>
</head>
<body>
  <${namePrefix}-app>
    ${preRender}
  </${namePrefix}-app>
  
  ${_.map((script) => `
    <script src="${script.path}" ${script.module ? 'type="module"' : ''}></script>
  `, scripts).join('')}

  ${initializeFirebaseAndApp(namePrefix, firebaseInitializeOptions, firebaseRootPath, firebaseLibs)}
    
  <style id="inline-style"></style>
  <script type="module">
    import sharedStyles from '/src/styles/shared-styles.js';
    import ckContent from '/src/styles/ck-content.js';
    const style = document.getElementById('inline-style');
    style.innerHTML += '\\n' + sharedStyles.cssText + '\\n' + ckContent.cssText;
  </script>
  </body>
</html>
`;

fs.writeFileSync('index.html', indexHtml);
