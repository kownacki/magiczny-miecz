import {mapValuesAndKeys} from 'mk-utils/general.js';

// Assigns keys to the corresponding properties on 'propName'.
// 'obj' must contain only objects.
export const assignKeys = (propName = 'key', transformId = _.identity, obj) =>
  mapValuesAndKeys(_, (val, id) => [{id: transformId(id), ...val}, id], obj);
