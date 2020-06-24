export default (text) => {
  document.head.querySelector('meta[name="description"]').setAttribute('content', text);
};
