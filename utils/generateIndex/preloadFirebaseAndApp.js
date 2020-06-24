import _ from 'lodash/fp.js';

export default (namePrefix, firebaseRootPath, firebaseLibs) => `
${_.map((lib) => `
  <link rel="preload" href="${firebaseRootPath}firebase-${lib}.js" as="script">
`, firebaseLibs).join('')}
<link rel="preload" href="/__/firebase/init.js" as="script">
<link rel="preload" href="/src/${namePrefix}-app.js" as="script" crossorigin="anonymous">
`;
