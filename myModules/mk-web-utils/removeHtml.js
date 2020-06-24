export default (text, breakReplacement = '\n') => {
  const el = document.createElement('div');
  el.innerHTML = _.replace(/<br>/g, breakReplacement, text);
  return el.innerText;
};
