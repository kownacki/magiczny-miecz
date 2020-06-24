import firebaseUtils from 'mk-utils/firebase.js';

export default firebaseUtils(_, firebase.firestore(), firebase.storage());
