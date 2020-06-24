import _ from 'lodash/fp.js';

export default (namePrefix, firebaseInitializeOptions, firebaseRootPath, firebaseLibs) => `
${_.map((lib) => `
  <script src="${firebaseRootPath}firebase-${lib}.js"></script>
`, firebaseLibs).join('')}
<script id="firebase-init"></script>
<script id="app"></script>  
<script type="module">
  const loadApp = () => {
    document.getElementById('app').type="module";
    document.getElementById('app').src="/src/${namePrefix}-app.js";
  };
  const firebaseInitScript =  document.getElementById('firebase-init');
  firebaseInitScript.src="/__/firebase/init.js";
  firebaseInitScript.addEventListener("load", loadApp);
  // If Loading Firebase SDKs from reserved URLs fails, then it means we are in development and we should import firebase module from npm
  firebaseInitScript.addEventListener("error", async () => {
    window.firebase = (await Promise.all([
      ${_.map((lib) => `import('firebase/${lib}')`, firebaseLibs).join(',')}
    ]))[0].default;

    firebase.initializeApp(${JSON.stringify(firebaseInitializeOptions)});
    loadApp();
  });
</script>
`;
