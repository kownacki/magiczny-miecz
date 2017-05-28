'use strict';

imports.regions.crag1 = {
  actions: [{
    type: 'roll',
    results: {
      1: [{
        type: 'addAttr',
        attr: 'lifes',
        value: -1,
      }],
      2: [{
        type: 'addAttr',
        attr: 'lifes',
        value: -1,
      }],
    },
    includeFriends: true,
  }],
  left: 'strongholdRuins',
  right: 'wolvenRavine',
};
