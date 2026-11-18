function sanitizeUser(user) {
  if (!user) return null;
  const safeUser = user.toJSON ? user.toJSON() : { ...user };
  delete safeUser.passwordHash;
  delete safeUser.__v;
  if (safeUser.id !== undefined) {
    safeUser.id = String(safeUser.id);
    safeUser._id = String(safeUser.id);
  }
  if (safeUser.charges !== undefined && safeUser.charges !== null) {
    safeUser.charges = Number(safeUser.charges);
  }
  return safeUser;
}

module.exports = sanitizeUser;
