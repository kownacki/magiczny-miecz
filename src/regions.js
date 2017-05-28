imports.regions = {
  crag1: {
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
  },
  strongholdRuins: {
    actions: [{
      type: 'cards',
      count: 1,
    }],
    left: 'tolimanTemple',
    right: 'crag1',
  },
  tolimanTemple: {
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
  },
  skullValley: {
    left: 'swamps1',
  },
  swamps1: {
    left: 'movingRocks1',
  },
  movingRocks1: {
    left: 'crag2',
  },
  crag2: {
    left: 'grassPlain',
  },
  grassPlain: {
    left: 'crossroads1',
  },
  crossroads1: {
    left: 'castle',
  },
  castle: {
    left: 'ghostTown',
  },
  ghostTown: {
    left: 'movingRocks2',
  },
  movingRocks2: {
    left: 'swamps2',
  },
  swamps2: {
    left: 'specterCrypt',
  },
  specterCrypt: {
    left: 'sleepPlain',
  },
  sleepPlain: {
    left: 'crossroads2',
  },
  crossroads2: {
    left: 'stoneForest',
  },
  stoneForest: {
    left: 'wolvenRavine',
  },
  wolvenRavine: {
    left: 'crag1',
  },
};
