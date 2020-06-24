export default (propName, Class) => {
  let unsubscribe;
  let editingEnabled;
  return class extends Class {
    constructor(...args) {
      super(...args);
      addEventListener('toggle-editing', (event) => {
        editingEnabled = event.detail;
        this[propName] = event.detail || Boolean(firebase.auth().currentUser)
      });
      unsubscribe = firebase.auth().onAuthStateChanged((user) => this[propName] = editingEnabled || Boolean(user));
    }
    disconnectedCallback() {
      unsubscribe();
      return super.disconnectedCallback();
    }
  };
};
