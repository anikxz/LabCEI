export const requireAdmin = (role?: string) => {
  return role === 'admin';
};

export const requireTechnician = (role?: string) => {
  return role === 'admin' || role === 'technician';
};
