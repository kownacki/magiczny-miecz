import {sleep} from 'mk-utils/general.js';

export default async (contentsElement) => {
  await sleep();
  const id = _.random(0, 1000000000);

  const getHost = (element) => {
    while (element.parentElement) {
      element = element.parentElement;
    }
    return element.parentNode.host;
  };

  const getHosts = (element) => {
    const hosts = [];
    while (getHost(element)) {
      element = getHost(element);
      hosts.push(element);
    }
    return hosts;
  };

  const hosts = getHosts(contentsElement);

  _.forEach(
    (host) => {
      const slot = document.createElement("slot");
      slot.setAttribute('slot', id);
      slot.setAttribute('name', id);
      host.appendChild(slot)
    }, _.initial(hosts)
  );

  const slot = document.createElement("slot");
  slot.setAttribute('name', id);

  contentsElement.parentNode.replaceChild(slot, contentsElement);

  contentsElement.setAttribute('slot', id);

  _.last(hosts).appendChild(contentsElement);
  await sleep();
};
