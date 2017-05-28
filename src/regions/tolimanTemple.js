'use strict';

imports.regions.tolimanTemple = {
  actions: [{
    type: 'doubleRoll',
    results: {
      2: [{
        type: 'addAttr',
        attr: 'lifes',
        value: -1,
      }],
      3: [{
        type: 'addAttr',
        attr: 'magic',
        value: -1,
      }, {
        type: 'addAttr',
        attr: 'sword',
        value: -1,
      }],
      4: [{
        type: 'loseSpell',
      }],
      5: [{
        type: 'loseFriend',
      }],
      6: [{
        type: 'gainSpell',
      }],
      7: [{
        type: 'choose',
        options: [{
          type: 'addAttr',
          attr: 'magic',
          value: 1,
        }, {
          type: 'addAttr',
          attr: 'sword',
          value: 1,
        }]
      }],
      8: [{
        type: 'gainMove',
      }],
      9: [{
        type: 'curse',
      }],
      10: [{
        type: 'gainItem',
        item: 'tolimanShield',
      }],
      11:  [{
        type: 'addAttr',
        attr: 'lifes',
        value: 1,
      }],
      12:  [{
        type: 'addAttr',
        attr: 'lifes',
        value: -1,
      }, {
        type: 'addAttr',
        attr: 'magic',
        value: -1,
      }, {
        type: 'addAttr',
        attr: 'sword',
        value: -1,
      }],
    },
  }],
  left: 'skullValley',
  right: 'strongholdRuins',
};
