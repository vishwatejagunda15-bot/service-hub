function parsePositiveInt(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const num = Number(value.trim());
    return Number.isSafeInteger(num) && num > 0 ? num : null;
  }
  return null;
}

module.exports = parsePositiveInt;
