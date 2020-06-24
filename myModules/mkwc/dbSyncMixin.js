export default (dataPropName, Class) =>
  class extends Class {
    static get properties() {
      return {
        // required params
        path: Object, // Parameter passed to get and update
        getData: Function,
        updateData: Function,
        // optional params
        noGet: Boolean, // prevent from getting data when path is set
        // observables
        // todo also check all prototypes
        ...(_.has('ready', super.properties) ? {} : {ready: Boolean}),
      };
    }
    constructor(...args) {
      super(...args);
      this.addEventListener('save', async (event) => {
        this.dispatchEvent(new CustomEvent('updated', {
          detail: await this.updateData(this.path, event.detail, this[dataPropName])
        }));
      });
    }
    updated(changedProperties) {
      if (changedProperties.has('path')) {
        if (this.path && !this.noGet) {
          (async () => {
            this[dataPropName] = await this.getData(this.path);
            this.ready = true;
            this.dispatchEvent(new CustomEvent('ready', {detail: this[dataPropName], composed: true}));
          })();
        }
      }
      super.updated(changedProperties);
    }
  };
