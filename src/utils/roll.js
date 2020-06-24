export const d6 = (forWhat) => {
  const result = _.random(1, 6);
  console.log(`Rolling for ${forWhat}: ${result}`);
  return result;
};
